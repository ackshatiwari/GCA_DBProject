from fastapi import APIRouter, HTTPException, Depends
from fastapi import File, UploadFile
from backend.api.auth import require_permission
from backend.app.logging_utils import get_file_logger
from backend.services.csv_processor import process_csv_bytes
from backend.schemas.survey import ManualSurveyPayload
import os
import psycopg2


router = APIRouter(prefix="/api", tags=["surveys"])
logger = get_file_logger("backend.api.surveys", "csv_import.log")

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

insert_into_surveys_query = """
            INSERT INTO public.surveys ( site_name, site_desc, stream_name, certified_monitor_name, weather_conditions, survey_date, latitude, longitude, stream_width, stream_depth, flow_rate, sampling_notes, created_at, site_id )
            VALUES ( %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s )
            RETURNING id;
        """

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


@router.post("/submit-data-manual")
def submit_data_manual(
    payload: ManualSurveyPayload,
    claims: dict = Depends(require_permission("write:manual_submit")),
):
    # Stores the manually entered data into Neon DB
    logger.info("Received manual survey data")
    # extract all the data received from the payload

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("Missing DATABASE_URL")
        raise HTTPException(status_code=500, detail="Database URL not configured")

    conn = psycopg2.connect(database_url)
    try:
        cur = conn.cursor()

        survey_values = (
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
        )

        cur.execute(
            insert_into_surveys_query,
            survey_values,
        )

        survey_id = cur.fetchone()[0]

        payload_data = payload.model_dump()
        logger.info("Payload data prepared for survey id %s", survey_id)

        for organism_name in MACRO_TAXA_FIELDS:
            count = payload_data.get(organism_name)
            if count in (None, ""):
                logger.info(
                    "Skipping macro taxa field %s: empty or missing", organism_name
                )
                continue
            logger.info(
                "Inserting macro taxa field %s with count %s and survey_id %s",
                organism_name,
                count,
                survey_id,
            )
            cur.execute(
                insert_into_macroinvertebrates_query,
                (organism_name, int(count), survey_id),
            )

        for collection_time_name in COLLECTION_TIME_FIELDS:
            collection_time = payload_data.get(collection_time_name)
            if collection_time in (None, ""):
                continue
            cur.execute(
                insert_into_collection_times_query,
                (survey_id, collection_time_name, collection_time),
            )

        for metric_name in METRIC_FIELDS:
            value = payload_data.get(metric_name)
            if value in (None, ""):
                continue
            cur.execute(
                insert_into_survey_metrics_query,
                (survey_id, metric_name, float(value)),
            )

        conn.commit()

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

    return {
        "message": "Manual survey received",
        "data": payload.model_dump(),
    }


@router.post("/submit-data-csv")
async def submit_data_csv(
    file: UploadFile = File(...),
    claims: dict = Depends(require_permission("write:csv_upload")),
):
    database_url = os.getenv("DATABASE_URL")
    logger.info("Incoming survey file: %s", file.filename)
    if not database_url:
        logger.error("Missing DATABASE_URL")
        raise HTTPException(status_code=500, detail="Database URL not configured")

    if not file.filename or not file.filename.lower().endswith((".csv", ".xlsx")):
        logger.warning("Invalid file extension: %s", file.filename)
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a CSV or .xlsx Excel file.",
        )

    try:
        csv_bytes = await file.read()
        logger.info("Read %s bytes from upload", len(csv_bytes))
        survey_payloads = process_csv_bytes(csv_bytes, file.filename)
        logger.info("Parsed %s payload rows", len(survey_payloads))
    except ValueError as ve:
        logger.warning("File processing error: %s", ve)
        raise HTTPException(status_code=400, detail=str(ve))

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        logger.info("Database connection opened successfully")
    except psycopg2.OperationalError as db_err:
        logger.error("Database connection failed: %s", str(db_err))
        raise HTTPException(
            status_code=503, detail=f"Database connection failed: {str(db_err)}"
        )

    inserted_survey_ids = []

    try:
        cur = conn.cursor()
        logger.info("Cursor created")

        for payload in survey_payloads:
            survey_values = (
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
            )

            cur.execute(
                insert_into_surveys_query,
                survey_values,
            )
            survey_id = cur.fetchone()[0]
            inserted_survey_ids.append(survey_id)
            logger.info("Inserted survey id: %s", survey_id)
            payload_data = payload.model_dump()

            for organism_name in MACRO_TAXA_FIELDS:
                count = payload_data.get(organism_name)
                if count in (None, ""):
                    continue
                cur.execute(
                    insert_into_macroinvertebrates_query,
                    (organism_name, int(count), survey_id),
                )

            for collection_time_name in COLLECTION_TIME_FIELDS:
                collection_time = payload_data.get(collection_time_name)
                if collection_time in (None, ""):
                    continue
                cur.execute(
                    insert_into_collection_times_query,
                    (survey_id, collection_time_name, collection_time),
                )

            for metric_name in METRIC_FIELDS:
                value = payload_data.get(metric_name)
                if value in (None, ""):
                    continue
                cur.execute(
                    insert_into_survey_metrics_query,
                    (survey_id, metric_name, float(value)),
                )

            conn.commit()
            logger.info("Committed survey id: %s", survey_id)
    except Exception as e:
        conn.rollback()
        logger.exception("Database error, rolled back transaction")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
        logger.info("Database connection closed")

    logger.info("Completed import. Total inserted: %s", len(inserted_survey_ids))
    return {
        "message": f"Successfully processed {len(inserted_survey_ids)} surveys from CSV",
    }


@router.get("/surveys/coords")
def get_survey_coords(
    claims: dict = Depends(require_permission("read:view_data")),
):
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("Missing DATABASE_URL")
        raise HTTPException(status_code=500, detail="Database URL not configured")

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, latitude, longitude, site_id, survey_date, site_name, site_desc, stream_name FROM public.surveys WHERE latitude IS NOT NULL AND longitude IS NOT NULL"
        )
        coords = [{"id": row[0], "latitude": row[1], "longitude": row[2], "site_id": row[3], "survey_date": row[4], "site_name": row[5], "site_desc": row[6], "stream_name": row[7]} for row in cur.fetchall()]
        logger.info("Fetched %s survey coordinates", len(coords))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

    return {"survey_coords": coords}




