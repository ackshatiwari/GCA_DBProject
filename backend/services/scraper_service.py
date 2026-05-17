
import json
import sys
from pathlib import Path
import urllib.parse

project_root = Path(__file__).parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.app.logging_utils import get_file_logger
from backend.schemas.survey import ManualSurveyPayload
from backend.services.survey_persistence import upsert_survey, refresh_children

import requests

logger = get_file_logger("backend.services.scraper_service", "webscrape.log")


def search_for_extra_surveys(json_data, site_id):
    # return a list of the survey_ids for the given site_id
    if site_id not in json_data:
        logger.warning(f"Site ID {site_id} not found in JSON data.")
        return []

    survey_ids = json_data[site_id]

    query = {
        "filters": [
            {"name": "site_id", "op": "eq", "val": site_id},
            {"or": [{"name": "has_been_deleted", "op": "neq", "val": "true"}, {"name": "has_been_deleted", "op": "is_null"}]},
            {"or": [{"name": "has_been_archived", "op": "neq", "val": "true"}, {"name": "has_been_archived", "op": "is_null"}]}
        ],
        "order_by": [{"field": "survey_date", "direction": "desc"}]
    }

    encoded_query = urllib.parse.quote(json.dumps(query))
    url = f"https://api.cleanwaterhub.org/v1/data/protocol_vasos_rocky_bottom?q={encoded_query}&results_per_page=200"

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"Successfully fetched data from API for site_id={site_id}. Number of records returned: {len(data.get('features', [])) if isinstance(data, dict) else 'N/A'}")
    except Exception as e:
        logger.error(f"ERROR: request to remote API failed for site_id={site_id}: {e}")
        return []

    # Normalize returned ids: API can return a FeatureCollection with 'features' list
    returned_ids = []
    if isinstance(data, dict) and "features" in data and isinstance(data["features"], list):
        for feature in data["features"]:
            # id may be at top-level or in properties
            fid = feature.get("id")
            if fid is None:
                props = feature.get("properties") or {}
                fid = props.get("id") or props.get("survey_id")
            if fid is not None:
                returned_ids.append(str(fid))
    elif isinstance(data, dict):
        returned_ids = [str(k) for k in data.keys()]
        logger.warning(f"Unexpected data format: expected 'features' list but got dict with keys: {list(data.keys())}")
    elif isinstance(data, list):
        # unexpected list of features
        for feature in data:
            fid = None
            if isinstance(feature, dict):
                fid = feature.get("id") or (feature.get("properties") or {}).get("id")
            if fid is not None:
                returned_ids.append(str(fid))
        logger.warning(f"Unexpected data format: expected 'features' list but got list of length {len(data)}")
    else:
        logger.error(f"ERROR: Unexpected data format from API for site_id={site_id}: {type(data)}")
        return []
    # Normalize existing survey ids to strings for comparison
    existing_ids = set(str(x) for x in survey_ids)
    returned_set = set(returned_ids)

    extra = returned_set - existing_ids

    # attempt to convert numeric ids back to int where appropriate
    def _convert(x):
        return int(x) if x.isdigit() else x

    return [_convert(x) for x in sorted(extra)]


def insert_extra_surveys(conn, site_id, survey_ids):
    if not survey_ids:
        logger.info(f"No extra surveys to insert for site_id={site_id}.")
        return

    # sample url to scrape is https://api.cleanwaterhub.org/v1/data/protocol_vasos_rocky_bottom/16881 with the survey id being 16881
    for survey_id in survey_ids:
        url = f"https://api.cleanwaterhub.org/v1/data/protocol_vasos_rocky_bottom/{survey_id}"
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Successfully fetched data for survey_id={survey_id} from API.")
        except Exception as e:
            logger.error(f"ERROR: request to remote API failed for survey_id={survey_id}: {e}")
            continue

        # Here you would add code to insert the survey data into your database using the `conn` connection.
        # This will depend on your database schema and how you want to handle duplicates, etc.
        # For example, you might have a function like `insert_survey_data(conn, data)` that takes care of this.
        

        # Map API fields into the ManualSurveyPayload expected keys
        mapper = {
            # map API -> ManualSurveyPayload field names
            "properties.certified_monitor": "name",
            "properties.weather_conditions": "weather",
            "properties.weather_conditions_today": "weather",
            "properties.survey_date": "date",
            "properties.average_stream_width": "stream_width",
            "properties.average_stream_depth": "stream_depth",
            "properties.flow_rate": "flow_rate",
            "properties.sampling_notes": "sampling_notes",
            "properties.site_id": "site_id",
            "properties.site.geometry.coordinates[0]": "longitude",
            "properties.site.geometry.coordinates[1]": "latitude",
            "properties.site.properties.site_name": "site_name",
            "properties.site.properties.description": "site_desc",
            "properties.site.properties.name_of_stream": "stream_name",
            "properties.id": "survey_id",
            "id": "survey_id",
        }

        survey_payload = {}
        for api_field, payload_field in mapper.items():
            parts = api_field.split(".")
            value = data
            try:
                for part in parts:
                    if part.endswith("]"):
                        field_name, index = part[:-1].split("[")
                        value = value.get(field_name, [])[int(index)]
                    else:
                        value = value.get(part)
                # For required fields name/weather/date, default to 'N/A' if missing
                if payload_field in ("name", "weather", "date") and (value is None or value == ""):
                    survey_payload[payload_field] = "N/A"
                else:
                    survey_payload[payload_field] = value
                logger.debug(f"Mapped API field '{api_field}' to payload field '{payload_field}' with value: {survey_payload[payload_field]}")
            except Exception as e:
                logger.warning(f"Failed to extract field '{api_field}' for survey_id={survey_id}: {e}")
                survey_payload[payload_field] = "N/A" if payload_field in ("name", "weather", "date") else None

        # Bring over any child-table fields (macro taxa, collection times, metrics)
        # when API property names already match schema field names.
        properties = data.get("properties") if isinstance(data, dict) else None
        if isinstance(properties, dict):
            for field_name in ManualSurveyPayload.model_fields.keys():
                if field_name in survey_payload:
                    continue
                if field_name in properties:
                    survey_payload[field_name] = properties.get(field_name)
            logger.debug(f"Final survey payload for survey_id={survey_id}: {survey_payload}")


        # Normalize key ids to integers when possible.
        for key in ("survey_id", "site_id"):
            val = survey_payload.get(key)
            if val in (None, ""):
                continue
            try:
                survey_payload[key] = int(float(val))
            except (TypeError, ValueError):
                logger.warning(f"Could not normalize {key}={val} to int for survey_id={survey_id}")

        try:
            payload = ManualSurveyPayload(**survey_payload)
            # Log all child-table fields for debugging
            payload_dict = payload.model_dump()
            organism_fields = [f for f in payload_dict if f in ("worms", "flatworms", "leeches", "crayfish", "sowbugs", "scuds", "stoneflies", "mayflies", "dragonflies", "damselflies", "hellgrammites", "fishflies", "alderflies", "common_netspinners", "most_caddisflies", "beetles", "midges", "blackflies", "most_true_flies", "gilled_snails", "lunged_snails", "clams") and payload_dict[f] not in (None, "")]
            metric_fields = [f for f in payload_dict if f.startswith("metric_") and payload_dict[f] not in (None, "")]
            collection_fields = [f for f in payload_dict if f.startswith("collection_time_") and payload_dict[f] not in (None, "")]
            if organism_fields or metric_fields or collection_fields:
                logger.info(f"survey_id={survey_id}: organisms={organism_fields}, metrics={metric_fields}, collections={collection_fields}")
            else:
                logger.debug(f"survey_id={survey_id}: No child-table fields populated (organisms, metrics, collections empty)")
            with conn.cursor() as cur:
                persisted_survey_id = upsert_survey(cur, payload)
                refresh_children(cur, persisted_survey_id, payload_dict)
                conn.commit()
            logger.info(f"Inserted/updated survey_id={survey_id} into database successfully.")
        except Exception as e:
            conn.rollback()
            logger.error(f"ERROR: Failed to insert/update survey_id={survey_id} into database: {e}")
            continue
        # do not close conn/cur here; caller manages connection lifecycle
            