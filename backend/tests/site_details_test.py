import os
import sys
from pathlib import Path

import pytest
from pprint import pprint

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
	sys.path.insert(0, str(PROJECT_ROOT))

from backend.api import surveys

SITE_ID = 11070


def test_get_survey_details_reads_real_data(capsys):
	database_url = os.getenv("DATABASE_URL")
	if not database_url:
		pytest.skip("DATABASE_URL is not set")

	result = surveys.get_survey_details(site_id=SITE_ID, claims={})
	
	print(result.macro_taxa_trends)

	captured = capsys.readouterr()
	assert captured.out.strip() != ""
	assert "site_name" in result
	assert "site_desc" in result
	assert "stream_name" in result
	assert result["site_name"]
	assert "survey_metadata" in result
	assert "macro_taxa_trends" in result


def _print_real_site_details():
	database_url = os.getenv("DATABASE_URL")
	if not database_url:
		raise RuntimeError("DATABASE_URL is not set")

	result = surveys.get_survey_details(site_id=SITE_ID, claims={})
	print(f"Using SITE_ID={SITE_ID}")
	pprint(result)


if __name__ == "__main__":
	_print_real_site_details()
