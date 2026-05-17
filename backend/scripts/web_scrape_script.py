# web scrapes every month for all sites and organisms, and checks the
# Example URL
# https://api.cleanwaterhub.org/v1/data/protocol_vasos_rocky_bottom?q=%7B%22filters%22:%5B%7B%22name%22:%22site_id%22,%22op%22:%22eq%22,%22val%22:%2211234%22%7D,%7B%22or%22:%5B%7B%22name%22:%22has_been_deleted%22,%22op%22:%22neq%22,%22val%22:%22true%22%7D,%7B%22name%22:%22has_been_deleted%22,%22op%22:%22is_null%22%7D%5D%7D,%7B%22or%22:%5B%7B%22name%22:%22has_been_archived%22,%22op%22:%22neq%22,%22val%22:%22true%22%7D,%7B%22name%22:%22has_been_archived%22,%22op%22:%22is_null%22%7D%5D%7D%5D,%22order_by%22:%5B%7B%22field%22:%22survey_date%22,%22direction%22:%22desc%22%7D%5D%7D&results_per_page=200


from decimal import Decimal
import os
import sys
import psycopg2
from pathlib import Path
import json


project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from backend.services.scraper_service import search_for_extra_surveys, insert_extra_surveys
from backend.app.logging_utils import get_file_logger

logger = get_file_logger("backend.scripts.web_scrape_script", "webscrape.log")

database_url = os.getenv("DATABASE_URL")



# Custom JSON encoder to handle Decimal types from psycopg2
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj) 
        return super().default(obj)


if not database_url:
    logger.error("ERROR: DATABASE_URL environment variable is not set.")
    sys.exit(1)

try:
    conn = psycopg2.connect(database_url)
    cur = conn.cursor()


    # this query gets all the site_id and survey_ids, and retrievs a dictionary of site_id to site_name
    get_siteid_surveyid_query = """
        SELECT s.site_id, s.survey_id
        FROM public.surveys s
        ORDER by s.site_id
        """
    logger.info("Executing query to fetch site_id and survey_id pairs...")

    cur.execute(get_siteid_surveyid_query)
    siteid_surveyid_pairs = cur.fetchall()
    logger.info(f"Fetched {len(siteid_surveyid_pairs)} site_id and survey_id pairs.")

    # create a dictionary of site_id with multiple survey_ids
    site_to_survey_ids = {}

    for site_id, survey_id in siteid_surveyid_pairs:
        if site_id not in site_to_survey_ids:
            site_to_survey_ids[site_id] = []
        site_to_survey_ids[site_id].append(survey_id)

    json_data = json.dumps(site_to_survey_ids, indent=2, cls=DecimalEncoder)
    logger.info("Site to survey IDs mapping:")
    logger.info(json_data)

    extras = {}
    for site_id in site_to_survey_ids:
        try:
            extra = search_for_extra_surveys(site_to_survey_ids, site_id)
            if extra:
                extras[site_id] = extra
        except Exception as e:
            logger.error(f"ERROR checking extras for site_id={site_id}: {e}")

    logger.info("Extra surveys found (site_id -> [extra_survey_ids]):")
    logger.info(json.dumps(extras, indent=2, cls=DecimalEncoder))


    # Now, scrape the API for each extra survey_id and site_id pair, and upload to db
    for site_id, extra_survey_ids in extras.items():
        insert_extra_surveys(conn, site_id=site_id, survey_ids=extra_survey_ids)
        logger.info(f"Finished processing extra surveys for site_id={site_id}")




except Exception as exc:
    logger.error(f"ERROR: Failed to connect to database or fetch site/survey data: {exc}")
    raise
finally:
    if 'cur' in locals() and cur is not None:
        cur.close()
    if 'conn' in locals() and conn is not None:
        conn.close()

