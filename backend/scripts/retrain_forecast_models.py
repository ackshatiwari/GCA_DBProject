import json
import sys
from pathlib import Path

# Add project root to sys.path so imports work
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

import os
import psycopg2
import pandas as pd
from backend.services.ml_service import fetch_aggregated_trends, forecast_linear, forecast_ets
from backend.app.logging_utils import get_file_logger

logger = get_file_logger("backend.scripts.retrain", "forecasts.log")


database_url = os.getenv("DATABASE_URL")

if not database_url:
    logger.error("DATABASE_URL environment variable is not set.")
    sys.exit(1)

try:
    conn = psycopg2.connect(database_url)
    logger.info("Connected to database for retraining")
except Exception as exc:
    logger.exception("Failed to connect to database: %s", exc)
    raise

cur = None

try:
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT DISTINCT s.site_id, m.organism_name
            FROM public.macro_taxa m
            JOIN public.surveys s ON m.survey_id = s.id
        """)
        combinations = cur.fetchall()
        logger.info("Found %d unique site/organism combinations to retrain.", len(combinations))
    except Exception as exc:
        logger.exception("Failed to fetch site/organism combinations: %s", exc)
        raise

    if not combinations:
        logger.warning("No site/organism combinations were returned from macro_taxa + surveys.")
        raise RuntimeError("No site/organism combinations were returned from macro_taxa + surveys.")

    inserted = 0
    skipped_no_data = 0
    skipped_insufficient = 0
    failures = 0

    for site_id, organism_name in combinations:
        try:
            logger.info("Processing site_id=%s, organism=%s", site_id, organism_name)

            df = fetch_aggregated_trends(conn, site_id, organism_name)
            if df is None or df.empty:
                logger.warning("No aggregated trend data for site_id=%s organism=%s; skipping.", site_id, organism_name)
                skipped_no_data += 1
                continue

            if len(df) < 3:
                logger.warning("Insufficient data for site_id=%s organism=%s: %d months; skipping.", site_id, organism_name, len(df))
                skipped_insufficient += 1
                continue

            if len(df) < 10:
                forecast, confidence_lower, confidence_upper, rmse, model_meta = forecast_linear(df, steps=5)
            else:
                forecast, confidence_lower, confidence_upper, rmse, model_meta = forecast_ets(df, steps=5)

            cur.execute("""
                SELECT MAX(s.survey_date)
                FROM public.macro_taxa m
                JOIN public.surveys s ON m.survey_id = s.id
                WHERE s.site_id::INTEGER = %s AND m.organism_name = %s
            """, (site_id, organism_name))
            result = cur.fetchone()
            last_data_ts = result[0] if result else None

            predictions_json = json.dumps({
                "steps": 5,
                "method": model_meta.get("method"),
                "values": forecast.tolist(),
                "confidence_lower": None if confidence_lower is None else list(confidence_lower),
                "confidence_upper": None if confidence_upper is None else list(confidence_upper),
            })

            cur.execute("""
                INSERT INTO public.ml_models (
                    site_id,
                    organism_name,
                    model_method,
                    predictions,
                    rmse,
                    data_points,
                    last_trained,
                    last_data_ts,
                    version
                )
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s, %s)
                ON CONFLICT (site_id, organism_name, model_method)
                DO UPDATE SET
                    predictions = EXCLUDED.predictions,
                    rmse = EXCLUDED.rmse,
                    data_points = EXCLUDED.data_points,
                    last_trained = NOW(),
                    last_data_ts = EXCLUDED.last_data_ts,
                    version = public.ml_models.version + 1
            """, (
                site_id,
                organism_name,
                model_meta.get("method", "unknown"),
                predictions_json,
                rmse,
                len(df),
                last_data_ts,
                1,
            ))
            conn.commit()

            inserted += 1
            logger.info("Upserted retrained model for site_id=%s organism=%s", site_id, organism_name)
        except Exception as exc:
            conn.rollback()
            failures += 1
            logger.exception("Failed while processing site_id=%s organism=%s: %s", site_id, organism_name, exc)
            raise
    logger.info("Retrain summary: inserted=%d skipped_no_data=%d skipped_insufficient=%d failures=%d", inserted, skipped_no_data, skipped_insufficient, failures)
except Exception as exc:
    logger.exception("retrain_forecast_models.py failed: %s", exc)
    raise
finally:
    if cur is not None:
        cur.close()
    conn.close()