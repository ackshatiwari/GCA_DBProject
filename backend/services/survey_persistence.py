import psycopg2

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
    cur.execute("DELETE FROM public.macro_taxa WHERE survey_id = %s", (survey_id,))
    cur.execute("DELETE FROM public.collection_times WHERE survey_id = %s", (survey_id,))
    cur.execute("DELETE FROM public.survey_metrics WHERE survey_id = %s", (survey_id,))


    for organism_name in MACRO_TAXA_FIELDS:
        count = payload.get(organism_name)
        if count in (None, ""):
            continue
        cur.execute(
            insert_into_macroinvertebrates_query,
            (organism_name, int(count), survey_id),
        )

    for collection_time_name in COLLECTION_TIME_FIELDS:
        collection_time = payload.get(collection_time_name)
        if collection_time in (None, ""):
            continue
        cur.execute(
            insert_into_collection_times_query,
            (survey_id, collection_time_name, collection_time),
        )

    for metric_name in METRIC_FIELDS:
        value = payload.get(metric_name)
        if value in (None, ""):
            continue
        cur.execute(
            insert_into_survey_metrics_query,
            (survey_id, metric_name, float(value)),
        )



