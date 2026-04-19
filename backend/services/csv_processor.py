from __future__ import annotations

from io import BytesIO
import re

import pandas as pd
from pydantic import ValidationError

from backend.app.logging_utils import get_file_logger
from backend.schemas.survey import ManualSurveyPayload


logger = get_file_logger("backend.csv_processor", "csv_import.log")


REQUIRED_FIELDS = {"date"}

NUMERIC_FIELDS = {
	"site_id",
	"stream_width",
	"stream_depth",
	"flow_rate",
	"collection_time_1",
	"collection_time_2",
	"collection_time_3",
	"collection_time_4",
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
	"metric_1",
	"metric_2",
	"metric_3",
	"metric_4",
	"metric_5",
	"metric_6",
}

STRING_FIELDS = {"name", "weather", "date", "sampling_notes"}


def _normalize_column_name(value: str) -> str:
	normalized = value.strip().lower()
	normalized = re.sub(r"[^a-z0-9]+", "_", normalized)
	normalized = re.sub(r"_+", "_", normalized)
	return normalized.strip("_")


def _is_empty(value: object) -> bool:
	if value is None:
		return True
	if isinstance(value, str) and value.strip() == "":
		return True
	return bool(pd.isna(value))


def _to_numeric_or_none(value: object, numeric_type: type) -> int | float | None:
    if _is_empty(value):
        return None
    try:
        return numeric_type(value)
    except (ValueError, TypeError):
        raise ValueError(f"Expected a {numeric_type.__name__} value, got: {value}")
	

def _to_string_or_none(value: object) -> str | None:
	if _is_empty(value):
		return None
	return str(value).strip()


def _to_date_string(value: object) -> str:
	if _is_empty(value):
		raise ValueError("date is required")

	parsed = pd.to_datetime(value, errors="coerce")
	if pd.isna(parsed):
		raise ValueError(f"Invalid date value: {value}")
	return parsed.date().isoformat()


def _clean_row(raw_row: dict[str, object]) -> dict[str, object]:
	cleaned: dict[str, object] = {}

	for field in ManualSurveyPayload.model_fields:
		value = raw_row.get(field)

		if field in NUMERIC_FIELDS:
			cleaned[field] = _to_numeric_or_none(value, float)
			continue

		if field == "date":
			cleaned[field] = _to_date_string(value)
			continue

		if field in STRING_FIELDS:
			cleaned[field] = _to_string_or_none(value)
			continue

		cleaned[field] = value

	return cleaned


def process_csv_bytes(csv_bytes: bytes) -> list[ManualSurveyPayload]:
	"""Parse CSV bytes into validated survey payload objects."""
	logger.info("Received %s bytes", len(csv_bytes) if csv_bytes else 0)
	if not csv_bytes:
		logger.warning("Validation failed: CSV file is empty")
		raise ValueError("CSV file is empty")

	dataframe = pd.read_csv(BytesIO(csv_bytes))
	logger.info("Parsed CSV shape: %s", dataframe.shape)
	if dataframe.empty:
		logger.warning("Validation failed: CSV has no data rows")
		raise ValueError("CSV has no data rows")

	normalized_columns = {
		column: _normalize_column_name(str(column)) for column in dataframe.columns
	}
	dataframe = dataframe.rename(columns=normalized_columns)
	logger.info("Normalized columns: %s", list(dataframe.columns))

	expected_fields = set(ManualSurveyPayload.model_fields.keys())
	missing_required = sorted(field for field in REQUIRED_FIELDS if field not in dataframe.columns)
	if missing_required:
		missing_as_text = ", ".join(missing_required)
		logger.warning("Validation failed: missing required columns: %s", missing_as_text)
		raise ValueError(f"Missing required CSV columns: {missing_as_text}")

	unexpected_columns = sorted(column for column in dataframe.columns if column not in expected_fields)
	if unexpected_columns:
		unexpected_as_text = ", ".join(unexpected_columns)
		logger.warning("Validation failed: unexpected columns: %s", unexpected_as_text)
		raise ValueError(
			"Unexpected CSV columns found. Rename or remove these columns: "
			f"{unexpected_as_text}"
		)

	validated_payloads: list[ManualSurveyPayload] = []
	logger.info("Starting row validation for %s rows", len(dataframe))

	for index, row in enumerate(dataframe.to_dict(orient="records"), start=2):
		try:
			cleaned_row = _clean_row(row)
			validated_payloads.append(ManualSurveyPayload.model_validate(cleaned_row))
		except (ValueError, ValidationError) as exc:
			logger.warning("Row %s failed validation: %s", index, exc)
			raise ValueError(f"Row {index}: {exc}") from exc

	logger.info("Successfully validated %s rows", len(validated_payloads))

	return validated_payloads

