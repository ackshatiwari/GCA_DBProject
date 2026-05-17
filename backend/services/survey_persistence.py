import psycopg2
from backend.app.logging_utils import get_file_logger

logger = get_file_logger("backend.services.survey_persistence", "survey_persistance.log")

# backend-logs\survey_persistance.log
from backend.app.logging_utils import get_file_logger
logger = get_file_logger("backend.services.survey_persistence", "survey_persistence.log")

MACRO_TAXA_FIELDS = [
    "worms",
    "flatworms",
    "leeches",
    "crayfish",
    "sowbugs",
    "scuds",
    "stoneflies",
    "mayflies",
    "dragonflies",
    "damselflies",
    "hellgrammites",
    "fishflies",
    "alderflies",
    "common_netspinners",
    "most_caddisflies",
    "beetles",
    "midges",
    "blackflies",
    "most_true_flies",
    "gilled_snails",
    "lunged_snails",
    "clams",
]

COLLECTION_TIME_FIELDS = [
    "collection_time_1",
    "collection_time_2",
    "collection_time_3",
    "collection_time_4",
]

METRIC_FIELDS = [
    "metric_1",
    "metric_2",
    "metric_3",
    "metric_4",
    "metric_5",
    "metric_6",
]

insert_into_macroinvertebrates_query = """
            INSERT INTO public.macro_taxa (organism_name, count, survey_id)
            VALUES ( %s, %s, %s )
        """

insert_into_collection_times_query = """
            INSERT INTO public.collection_times (survey_id, collection_time_name, collection_time)
            VALUES ( %s, %s, %s )
        """
insert_into_survey_metrics_query = """
            INSERT INTO public.survey_metrics (survey_id, metric, value)
            VALUES ( %s, %s, %s )
        """

def upsert_survey(cur, payload):
    # This function performs an upsert (update or insert) operation for a survey record in the database.
    # It uses the survey_id to determine if the record already exists. If it does,
    # it updates the existing record; otherwise, it inserts a new one.
    upsert_query = """
        INSERT INTO public.surveys ( site_name, site_desc, stream_name, certified_monitor_name, weather_conditions, survey_date, latitude, longitude, stream_width, stream_depth, flow_rate, sampling_notes, created_at, site_id, survey_id )
                VALUES ( %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s, %s )
                ON CONFLICT (site_id, survey_date)
                DO UPDATE SET
                    site_name = EXCLUDED.site_name,
                    site_desc = EXCLUDED.site_desc,
                    stream_name = EXCLUDED.stream_name,
                    certified_monitor_name = EXCLUDED.certified_monitor_name,
                    weather_conditions = EXCLUDED.weather_conditions,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    stream_width = EXCLUDED.stream_width,
                    stream_depth = EXCLUDED.stream_depth,
                    flow_rate = EXCLUDED.flow_rate,
                    sampling_notes = EXCLUDED.sampling_notes,
                    site_id = EXCLUDED.site_id,
                    survey_id = EXCLUDED.survey_id
                RETURNING id;
    """

   # vales that will be upserted to Neon
    values = (
        payload.site_name,
        payload.site_desc,
        payload.stream_name,
        payload.name,
        payload.weather,
        payload.date,
        payload.latitude,
        payload.longitude,
        payload.stream_width,
        payload.stream_depth,
        payload.flow_rate,
        payload.sampling_notes,
        payload.site_id,
        payload.survey_id,
    )

    cur.execute(upsert_query, values)
    return cur.fetchone()[0]

def refresh_children(cur, survey_id, payload):
    # This function refreshes the child tables (organisms and metrics) associated with a survey record.
    # It first deletes any existing records in the child tables for the given survey_id,
    # and then inserts the new records based on the provided payload.
    logger.info(f"refresh_children called for survey_id={survey_id}")
    cur.execute("DELETE FROM public.macro_taxa WHERE survey_id = %s", (survey_id,))
    deleted_macro = cur.rowcount
    cur.execute("DELETE FROM public.collection_times WHERE survey_id = %s", (survey_id,))
    deleted_collections = cur.rowcount
    cur.execute("DELETE FROM public.survey_metrics WHERE survey_id = %s", (survey_id,))
    deleted_metrics = cur.rowcount
    logger.debug(f"Deleted rows for survey_id={survey_id}: macro_taxa={deleted_macro}, collection_times={deleted_collections}, survey_metrics={deleted_metrics}")

    logger.debug(f"Survey ID {survey_id}: Payload for child tables: {payload}")


    for organism_name in MACRO_TAXA_FIELDS:
        count = payload.get(organism_name)
        if count in (None, ""):
            continue
        try:
            cur.execute(
                insert_into_macroinvertebrates_query,
                (organism_name, int(count), survey_id),
            )
        except Exception as e:
            logger.warning(f"Failed to insert macro_taxa {organism_name} for survey_id={survey_id}: {e}")
        logger.debug(f"Inserted macroinvertebrate '{organism_name}' with count={count} for survey_id={survey_id}")

    for collection_time_name in COLLECTION_TIME_FIELDS:
        collection_time = payload.get(collection_time_name)
        if collection_time in (None, ""):
            continue
        try:
            cur.execute(
                insert_into_collection_times_query,
                (survey_id, collection_time_name, collection_time),
            )
        except Exception as e:
            logger.warning(f"Failed to insert collection_time {collection_time_name} for survey_id={survey_id}: {e}")
        logger.debug(f"Inserted collection time '{collection_time_name}' with value={collection_time} for survey_id={survey_id}")

    for metric_name in METRIC_FIELDS:
        value = payload.get(metric_name)
        if value in (None, ""):
            continue
        try:
            cur.execute(
                insert_into_survey_metrics_query,
                (survey_id, metric_name, float(value)),
            )
        except Exception as e:
            logger.warning(f"Failed to insert metric {metric_name} for survey_id={survey_id}: {e}")

    logger.info(f"refresh_children finished for survey_id={survey_id}")
    logger.debug(f"Inserted survey metric '{metric_name}' with value={value} for survey_id={survey_id}")



