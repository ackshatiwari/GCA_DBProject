import os

import psycopg2
import pytest


def test_connects_to_neon():
	database_url = os.getenv("DATABASE_URL")
	if not database_url:
		pytest.skip("DATABASE_URL is not set")

	conn = None
	try:
		conn = psycopg2.connect(database_url, sslmode="require", connect_timeout=10)
		with conn.cursor() as cur:
			cur.execute("SELECT 1")
			assert cur.fetchone() == (1,)
	finally:
		if conn is not None:
			conn.close()


if __name__ == "__main__":
	test_connects_to_neon()
