from __future__ import annotations

from io import BytesIO
from pathlib import Path
import re

import pandas as pd
from pydantic import ValidationError

from backend.app.logging_utils import get_file_logger
from backend.schemas.survey import ManualSurveyPayload


logger = get_file_logger("backend.csv_processor", "csv_import.log")


REQUIRED_FIELDS = {
    "date",
}


NUMERIC_FIELDS = {
    "site_id",
    "survey_id",
    "latitude",
    "longitude",
    "stream_width",
    "stream_depth",
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

STRING_FIELDS = {
    "site_name",
    "site_desc",
    "stream_name",
    "name",
    "flow_rate",
    "weather",
    "date",
    "sampling_notes",
}

gca_tbl_to_payload_field_mapping = {
    "survey_date": "date",
    "certified_monitor": "name",
    "site_name": "site_name",
    "site_description": "site_desc",
    "description": "site_desc",
    "name_of_stream": "stream_name",
    "stream": "stream_name",
    "weather_conditions_today": "weather",
    "weather_last_72_hours": "weather",
    "latitude_measure": "latitude",
    "latitude_m": "latitude",
    "latitude": "latitude",
    "longitude_measure": "longitude",
    "longitude": "longitude",
    "average_stream_width": "stream_width",
    "average_stream_depth": "stream_depth",
    "collection_time_net1": "collection_time_1",
    "collection_time_net2": "collection_time_2",
    "collection_time_net3": "collection_time_3",
    "collection_time_net4": "collection_time_4",
    "id": "survey_id",
}


def _normalize_and_map_dataframe(dataframe: pd.DataFrame) -> pd.DataFrame:
    normalized_columns = {
        column: _normalize_column_name(str(column)) for column in dataframe.columns
    }
    dataframe = dataframe.rename(columns=normalized_columns)
    dataframe = dataframe.rename(columns=gca_tbl_to_payload_field_mapping)

    
    if len(dataframe.columns) != len(set(dataframe.columns)):
        duplicate_cols = [col for col in dataframe.columns if list(dataframe.columns).count(col) > 1]
        logger.info("Detected duplicate columns after mapping: %s", duplicate_cols)
        
        for col_name in set(duplicate_cols):
            col_indices = [i for i, c in enumerate(dataframe.columns) if c == col_name]
            if len(col_indices) > 1:
                for idx in col_indices[1:]:
                    mask = dataframe.iloc[:, col_indices[0]].isna()
                    dataframe.iloc[mask, col_indices[0]] = dataframe.iloc[mask, idx]
        
        dataframe = dataframe.loc[:, ~dataframe.columns.duplicated(keep='first')]
        logger.info("Deduplicated columns. Remaining: %s", list(dataframe.columns))

    if (
        "weather" not in dataframe.columns
        and "weather_conditions_yesterday" in dataframe.columns
    ):
        dataframe = dataframe.rename(
            columns={"weather_conditions_yesterday": "weather"}
        )

    if (
        "dragonflies" not in dataframe.columns
        and "dragonflies_and_damselflies" in dataframe.columns
    ):
        dataframe["dragonflies"] = dataframe["dragonflies_and_damselflies"]
    if (
        "hellgrammites" not in dataframe.columns
        and "hellgrammites_fishflies_alderflies" in dataframe.columns
    ):
        dataframe["hellgrammites"] = dataframe["hellgrammites_fishflies_alderflies"]

    return dataframe


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
        return ""
    return str(value).strip()


def _to_date_string(value: object) -> str:
    if _is_empty(value):
        raise ValueError("date is required")

    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        # set the default date to today's date if parsing fails, but log a warning
        logger.warning(
            "Failed to parse date value: %s. Defaulting to today's date.", value
        )
        return pd.Timestamp.now().date().isoformat()
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


def _read_dataframe(file_bytes: bytes, filename: str | None = None) -> pd.DataFrame:
    if not filename:
        return pd.read_csv(BytesIO(file_bytes))

    extension = Path(filename).suffix.lower()
    if extension == ".csv":
        return pd.read_csv(BytesIO(file_bytes))

    if extension == ".xlsx":
        excel_file = pd.ExcelFile(BytesIO(file_bytes), engine="openpyxl")
        best_sheet = None
        best_score = -1
        best_dataframe = None

        anchor_fields = {
            "date",
            "site_id",
            "site_name",
            "site_desc",
            "stream_name",
            "name",
            "weather",
            "latitude",
            "longitude",
            "stream_width",
            "sampling_notes",
        }

        for sheet_name in excel_file.sheet_names:
            dataframe = pd.read_excel(excel_file, sheet_name=sheet_name)
            logger.info("Sheet '%s' raw columns: %s", sheet_name, list(dataframe.columns))
            mapped_dataframe = _normalize_and_map_dataframe(dataframe)
            mapped_headers = set(mapped_dataframe.columns)
            logger.info("Sheet '%s' normalized columns: %s", sheet_name, list(mapped_headers))
            score = len(mapped_headers & anchor_fields)
            logger.info("Sheet '%s' anchor field matches (score %s): %s", sheet_name, score, list(mapped_headers & anchor_fields))

            if "date" in mapped_headers:
                score += 1000
                logger.info("Sheet '%s' has date column, bonus applied. New score: %s", sheet_name, score)

            if score > best_score:
                best_score = score
                best_sheet = sheet_name
                best_dataframe = mapped_dataframe

        if best_dataframe is None or best_score < 2:
            raise ValueError("No worksheet appears to contain survey data")

        logger.info("Selected sheet '%s' with score %s. All columns: %s", best_sheet, best_score, list(best_dataframe.columns))

        # Try to find a separate sheet that contains site metadata (site_name, site_desc, stream_name)
        site_metadata_df = None
        for sheet_name in excel_file.sheet_names:
            if sheet_name == best_sheet:
                continue
            sheet_df = pd.read_excel(excel_file, sheet_name=sheet_name)
            mapped_sheet_df = _normalize_and_map_dataframe(sheet_df)
            if ("site_name" in mapped_sheet_df.columns or "site_desc" in mapped_sheet_df.columns or "stream_name" in mapped_sheet_df.columns) and "site_id" in mapped_sheet_df.columns:
                site_metadata_df = mapped_sheet_df
                logger.info("Found site metadata sheet '%s' with site metadata columns", sheet_name)
                break

        # Try to find a separate sheet that contains latitude/longitude and merge it
        coord_sheet = None
        coord_df = None
        for sheet_name in excel_file.sheet_names:
            if sheet_name == best_sheet:
                continue
            sheet_df = pd.read_excel(excel_file, sheet_name=sheet_name)
            mapped_sheet_df = _normalize_and_map_dataframe(sheet_df)
            if "latitude" in mapped_sheet_df.columns and "longitude" in mapped_sheet_df.columns:
                coord_sheet = sheet_name
                coord_df = mapped_sheet_df
                logger.info("Found coordinate sheet '%s' with latitude/longitude columns", coord_sheet)
                break

        if coord_df is not None:
            # Merge coords into best_dataframe. Prefer join on site_id, then name, else by index if lengths match.
            try:
                if "site_id" in best_dataframe.columns and "site_id" in coord_df.columns:
                    best_dataframe = best_dataframe.merge(
                        coord_df[["site_id", "latitude", "longitude"]],
                        on="site_id",
                        how="left",
                    )
                    logger.info("Merged coordinates into main sheet using 'site_id'.")
                elif "name" in best_dataframe.columns and "name" in coord_df.columns:
                    best_dataframe = best_dataframe.merge(
                        coord_df[["name", "latitude", "longitude"]],
                        on="name",
                        how="left",
                    )
                    logger.info("Merged coordinates into main sheet using 'name'.")
                elif len(coord_df) == len(best_dataframe):
                    best_dataframe = best_dataframe.copy()
                    best_dataframe["latitude"] = coord_df["latitude"].values
                    best_dataframe["longitude"] = coord_df["longitude"].values
                    logger.info("Assigned coordinates to main sheet by row index (equal lengths).")
                else:
                    logger.info(
                        "Found coordinate sheet but could not reliably merge (no matching key and differing lengths)."
                    )
            except Exception as exc:
                logger.warning("Failed to merge coordinate sheet: %s", exc)

        if site_metadata_df is not None:
            try:
                columns_to_merge = ["site_id"]
                if "site_name" in site_metadata_df.columns:
                    columns_to_merge.append("site_name")
                if "site_desc" in site_metadata_df.columns:
                    columns_to_merge.append("site_desc")
                if "stream_name" in site_metadata_df.columns:
                    columns_to_merge.append("stream_name")

                if "site_id" in best_dataframe.columns and "site_id" in site_metadata_df.columns:
                    best_dataframe = best_dataframe.merge(
                        site_metadata_df[columns_to_merge],
                        on="site_id",
                        how="left",
                        suffixes=("", "_sites")
                    )
                    logger.info("Merged site metadata into main sheet using 'site_id'.")
            except Exception as exc:
                logger.warning("Failed to merge site metadata sheet: %s", exc)

        logger.info("Selected worksheet %s with score %s", best_sheet, best_score)
        return best_dataframe

    raise ValueError("Unsupported file type. Please upload a CSV or .xlsx Excel file.")


def process_csv_bytes(
    csv_bytes: bytes, filename: str | None = None
) -> list[ManualSurveyPayload]:
    """Parse CSV or Excel bytes into validated survey payload objects."""
    logger.info("Received %s bytes", len(csv_bytes) if csv_bytes else 0)
    if not csv_bytes:
        logger.warning("Validation failed: CSV file is empty")
        raise ValueError("CSV file is empty")

    dataframe = _read_dataframe(csv_bytes, filename)
    logger.info("Parsed tabular file shape: %s", dataframe.shape)
    if dataframe.empty:
        logger.warning("Validation failed: file has no data rows")
        raise ValueError("File has no data rows")

    dataframe = _normalize_and_map_dataframe(dataframe)
    logger.info("Normalized columns: %s", list(dataframe.columns))

    expected_fields = set(ManualSurveyPayload.model_fields.keys())
    missing_required = sorted(
        field for field in REQUIRED_FIELDS if field not in dataframe.columns
    )
    if missing_required:
        missing_as_text = ", ".join(missing_required)
        logger.warning(
            "Validation failed: missing required columns: %s", missing_as_text
        )
        raise ValueError(f"Missing required CSV columns: {missing_as_text}")

    unexpected_columns = sorted(
        column for column in dataframe.columns if column not in expected_fields
    )
    if unexpected_columns:
        logger.info("Dropping non-payload columns: %s", ", ".join(unexpected_columns))
        dataframe = dataframe.drop(columns=unexpected_columns)

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
