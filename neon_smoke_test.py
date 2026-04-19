import os
import psycopg2


def run_smoke_test():
    database_url = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(database_url)

    try:
        cur = conn.cursor()

        insert_query = """
            INSERT INTO public.surveys (
                certified_monitor_name,
                weather_conditions,
                survey_date,
                stream_width,
                stream_depth,
                flow_rate,
                sampling_notes,
                collection_time_1,
                collection_time_2,
                collection_time_3,
                collection_time_4,
                created_at
            )
            VALUES (
                'John Doe',
                'Sunny',
                '2024-06-01',
                20,
                2,
                'Normal',
                'Low Water Levels',
                30,
                30,
                30,
                30,
                '2024-06-01 12:00:00'
            );
        """

        cur.execute(insert_query)
        conn.commit()

    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    run_smoke_test()
