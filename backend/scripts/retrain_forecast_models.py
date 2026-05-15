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


database_url = os.getenv("DATABASE_URL")

if not database_url:
    print("ERROR: DATABASE_URL environment variable is not set.")
    sys.exit(1)

try:
    conn = psycopg2.connect(database_url)
except Exception as exc:
    print(f"ERROR: Failed to connect to database: {exc}")
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
        print(f"Found {len(combinations)} unique site/organism combinations to retrain.")
    except Exception as exc:
        print(f"ERROR: Failed to fetch site/organism combinations: {exc}")
        raise

    if not combinations:
        raise RuntimeError("No site/organism combinations were returned from macro_taxa + surveys.")

    for site_id, organism_name in combinations:
        try:
            print(f"Processing site_id={site_id}, organism={organism_name}")

            df = fetch_aggregated_trends(conn, site_id, organism_name)
            if df is None or df.empty:
                print(f"WARNING: No aggregated trend data returned for site_id={site_id}, organism={organism_name}; skipping.")
                continue

            if len(df) < 3:
                print(
                    f"WARNING: Insufficient data for site_id={site_id}, organism={organism_name}: {len(df)} months; skipping."
                )
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

            print(f"Inserted retrained model for site_id {site_id}, organism {organism_name}.")
        except Exception as exc:
            conn.rollback()
            print(f"ERROR: Failed while processing site_id={site_id}, organism={organism_name}: {exc}")
            raise
except Exception as exc:
    print(f"ERROR: retrain_forecast_models.py failed: {exc}")
    raise
finally:
    if cur is not None:
        cur.close()
    conn.close()