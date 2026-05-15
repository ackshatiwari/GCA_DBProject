import os
import psycopg2


database_url = os.getenv("DATABASE_URL")
conn = psycopg2.connect(database_url)

try:
    cur = conn.cursor()

    # Fetch all unique site_id and organism_name combinations
    cur.execute("""
        SELECT DISTINCT s.site_id, m.organism_name
        FROM public.macro_taxa m
        JOIN public.surveys s ON m.survey_id = s.id
    """)
    combinations = cur.fetchall()

    print(f"Found {len(combinations)} unique site/organism combinations to retrain.")

    for site_id, organism_name in combinations:
        print(f"Retraining forecast model for site_id {site_id}, organism {organism_name}...")
        # Here you would call your forecasting functions to retrain the models for each combination.
        # For example:
        # df = fetch_aggregated_trends(conn, site_id, organism_name)
        # forecast_linear(df)
        # forecast_ets(df)
        # You can also log the results or save the retrained models as needed.

finally:
    cur.close()
    conn.close()