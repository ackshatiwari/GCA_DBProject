# Scraper -> Database Wiring Runbook (Do-It-Yourself)

This guide is intentionally detailed so you can implement and operate the ingestion flow yourself, using Google for any API/library details.

Goal:
- Pull new survey data from Clean Water Hub (or your identified endpoint).
- Insert into Neon/Postgres only when data is new.
- Keep ingestion reliable, idempotent, and observable.

---

## 1) Target Architecture (What Goes Where)

Use this project layout and responsibility split:

- API routes and auth checks:
  - `backend/api/surveys.py`
- App bootstrap and router wiring:
  - `backend/app/server.py`
- Data parsing/normalization/business logic:
  - `backend/services/`
- Reusable DB persistence logic:
  - `backend/services/` (new module)
- Scheduled/CLI sync runner:
  - `backend/jobs/` or `backend/scripts/` (new folder)
- Frontend status display:
  - `frontend/src/components/ViewData.jsx`
  - `frontend/src/api/client.js` (or a dedicated API helper)

Why this split:
- Keeps API handlers thin.
- Lets you run ingestion from scheduler, manual trigger endpoint, or backfill script.
- Avoids duplicate SQL logic in multiple places.

Google terms if needed:
- "fastapi service layer pattern"
- "python repository pattern postgres"
- "idempotent ETL design"

---

## 2) Decide Your Data Source Strategy

Pick one method first:

1. Preferred: direct JSON/XHR endpoint you discovered.
2. Fallback: browser-rendered scrape with Playwright/Selenium.

Use direct endpoint unless blocked. It is faster, less fragile, and easier to schedule.

Google terms:
- "Chrome DevTools copy as fetch"
- "requests replicate browser headers"
- "playwright wait_for_selector python"

---

## 3) Add Database Idempotency Guardrails First

Do this before writing scheduler code.

### 3.1 Add uniqueness rule

In Neon/Postgres, create a unique index so reruns cannot create duplicates.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_surveys_site_date
ON public.surveys (site_id, survey_date);
```

If uniqueness must include protocol/source, adjust to:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_surveys_site_date_protocol
ON public.surveys (site_id, survey_date, survey_id);
```

Choose only one unique strategy based on your true business key.

Google terms:
- "postgres unique index composite key"
- "natural key vs surrogate key data warehouse"

### 3.2 Convert inserts to upsert

Where you currently do `INSERT INTO public.surveys`, move to:

```sql
INSERT INTO public.surveys (...)
VALUES (...)
ON CONFLICT (site_id, survey_date)
DO UPDATE SET
  weather_conditions = EXCLUDED.weather_conditions,
  stream_width = EXCLUDED.stream_width,
  stream_depth = EXCLUDED.stream_depth,
  flow_rate = EXCLUDED.flow_rate,
  sampling_notes = EXCLUDED.sampling_notes
RETURNING id;
```

If you prefer immutable historical records, use `DO NOTHING` instead.

---

## 4) Extract Reusable DB Write Logic

Create a new service module, for example:
- `backend/services/survey_persistence.py`

Put shared operations there:
- `upsert_survey(conn, payload) -> survey_row_id`
- `replace_macro_taxa(conn, survey_row_id, payload)`
- `replace_collection_times(conn, survey_row_id, payload)`
- `replace_metrics(conn, survey_row_id, payload)`

Implementation notes:
- Keep one transaction per survey payload.
- If upsert updates existing survey, delete-and-reinsert child rows for simple consistency.
- Always parameterize SQL.

Google terms:
- "psycopg2 transaction rollback best practices"
- "upsert parent child rows postgres"

---

## 5) Build Remote Ingestion Service

Create another module, for example:
- `backend/services/remote_ingest.py`

### 5.1 Fetching strategy
- Purpose: obtain raw records from the upstream source as a consistent list of dicts.
- Preferred approach: call the upstream JSON/XHR endpoint directly. Use browser automation (Playwright) only when the endpoint is not available.
- Function signature: `fetch_remote_records(site_id: int, *, page: int|None = None) -> list[dict]`.
- Implementation notes:
  - Use `requests` with a timeout, retry/backoff, and explicit headers (User-Agent, Accept).
  - Support pagination or cursors if upstream returns large result sets.
  - If client-rendered, use `playwright.sync_api` to load the page deterministically, wait for the network response or DOM node that contains JSON, then parse.
  - Always validate the shape of the returned JSON and log unexpected variants.

### 5.2 Normalization & validation
- Purpose: map upstream fields into your `ManualSurveyPayload` shape and ensure types are safe.
- Function signature: `normalize_remote_record(raw: dict) -> dict` (returns a dict compatible with `ManualSurveyPayload`).
- Rules and checks:
  - Map fields explicitly (avoid positional or heuristic mapping).
  - Parse dates with `dateutil.parser.isoparse` to get timezone-aware `datetime` objects.
  - Convert numeric strings to `int`/`float` using safe helpers that return `None` on empty values.
  - Validate required keys (`site_id`, `survey_date`), and raise `ValueError` for malformed records so they are logged and skipped or bubbled up depending on policy.
  - Normalize missing optional fields to `None` rather than the empty string.

Example snippets:

```python
from dateutil.parser import isoparse

def normalize_remote_record(raw: dict) -> dict:
    if 'date' not in raw or 'site_id' not in raw:
        raise ValueError('missing required fields')
    dt = isoparse(raw['date'])
    return {
        'site_id': int(raw['site_id']),
        'survey_date': dt.isoformat(),
        'latitude': float(raw.get('lat')) if raw.get('lat') else None,
        'longitude': float(raw.get('lon')) if raw.get('lon') else None,
        # map other fields explicitly
    }
```

### 5.3 Latest-local-date lookup
- Purpose: determine the most recent local `survey_date` for a site to avoid redundant writes.
- Function signature: `get_latest_local_date(conn, site_id: int) -> datetime | None`.
- SQL pattern: `SELECT MAX(survey_date) FROM public.surveys WHERE site_id = %s`.
- Performance notes:
  - For single-site runs this query is fine. For many sites, fetch `MAX(survey_date)` per site in one grouped query: `SELECT site_id, MAX(survey_date) FROM public.surveys WHERE site_id = ANY(%s) GROUP BY site_id`.
  - Return timezone-aware `datetime` objects or `None`.

### 5.4 Filtering & change detection
- Purpose: return only payloads that are new (or represent a changed survey) relative to local DB state.
- Function signature: `filter_new_records(records: list[dict], latest_dates: dict[str, datetime]) -> list[dict]`.
- Rules:
  - Primary test: include if `incoming_date > latest_date`.
  - Optional update detection: compute a checksum of stable payload fields (JSON dump with sorted keys → SHA256). If `incoming_date == latest_date` but checksum differs, include as an "update".
  - Treat records with identical date+checksum as duplicates and skip.

Example checksum:

```python
import json, hashlib

def checksum_payload(payload: dict) -> str:
    s = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(s.encode()).hexdigest()
```

### 5.5 Reliability, retries & observability
- Purpose: make ingestion robust and diagnosable when scheduled.
- Retries & backoff:
  - Wrap remote fetches with exponential backoff (use `tenacity` or a simple loop) and retry on timeouts and 5xx responses; fail fast on 4xx.
- Transaction model:
  - For each payload, open a DB transaction, call `upsert_survey(cur, payload)` and `refresh_children(cur, id, payload)` then `commit()`; on per-record failure either log and continue or abort the run depending on your policy.
  - Optionally batch commits for small groups of payloads for performance, but still ensure idempotency.
- Logging & run metrics:
  - Emit per-run counters: `fetched`, `filtered_in`, `inserted`, `updated`, `skipped`, `errors`.
  - Insert a row into `ingest_runs` (see runbook §9.1) summarizing the run.
- Error handling:
  - For transient record-level errors (bad fields) log and continue.
  - For systemic errors (DB down) exit with non-zero code so the scheduler can retry and send alerts.
- Testing:
  - Unit tests for `normalize_remote_record` (date edge-cases), `filter_new_records` (checksum/update detection), and `get_latest_local_date` (mocked DB).
  - Integration test: mocked HTTP → dry-run that verifies `filter_new_records` returns the expected set.

---

---

## 6) Add a Manual Admin Trigger Endpoint

In `backend/api/surveys.py`, add admin-only routes:

- `POST /api/ingest/remote/run`
  - Runs one ingestion cycle now.
  - Returns summary: fetched, inserted, updated, skipped, errors.
- `GET /api/ingest/remote/status`
  - Returns last successful run timestamp and counters.

Auth recommendation:
- Create dedicated permission, for example `write:remote_ingest`.
- Reuse your existing `require_permission(...)` dependency.

Google terms:
- "fastapi background task vs external scheduler"
- "auth0 api permissions scopes"

---

## 7) Add Job Runner Script (for Scheduler)

Create a runnable script:
- `backend/jobs/run_remote_ingest.py`

Script behavior:
- Load env (`DATABASE_URL`, endpoint URL, API key if needed).
- Open DB connection.
- Run ingestion service once.
- Log summary.
- Exit with code 0 on success, non-zero on failure.

CLI options worth adding:
- `--site-id 32285` (single site)
- `--all-sites`
- `--dry-run` (no DB writes)

Google terms:
- "python argparse example"
- "exit codes for scheduled tasks"

---

## 8) Choose Scheduling Method

For your current Windows environment, use Task Scheduler first.

### 8.1 Frequency recommendation

Start with daily at off-hours (2 AM local).

Move to hourly if:
- Upstream updates multiple times per day.
- You need fresher dashboards.

### 8.2 Task Scheduler setup (Windows)

1. Open Task Scheduler -> Create Task.
2. Name: `GooseCreekRemoteIngest`.
3. Trigger: Daily at 2:00 AM.
4. Action: Start a program.
5. Program/script: path to project venv Python executable.
6. Add arguments: `backend/jobs/run_remote_ingest.py --all-sites`
7. Start in: project root folder.
8. Configure to run whether user is logged in or not.
9. Enable retry on failure (for example 3 retries, 10 min apart).

Google terms:
- "windows task scheduler python virtualenv"
- "task scheduler start in working directory"

Optional cron equivalent (Linux):

```bash
0 2 * * * /path/to/venv/bin/python /path/to/project/backend/jobs/run_remote_ingest.py --all-sites
```

---

## 9) Add Observability (Do Not Skip)

Track ingestion health in a table or log file.

### 9.1 Add run log table

```sql
CREATE TABLE IF NOT EXISTS public.ingest_runs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  fetched_count integer default 0,
  inserted_count integer default 0,
  updated_count integer default 0,
  skipped_count integer default 0,
  error_message text
);
```

Statuses example:
- `running`
- `success`
- `failed`

### 9.2 Minimum logs

Log these fields each run:
- source endpoint
- site_id set
- fetched/inserted/updated/skipped counts
- first and last survey_date processed
- exception stack traces

---

## 10) Frontend Wiring for Status

Display ingestion status in your existing data view.

Where:
- `frontend/src/components/ViewData.jsx`
- `frontend/src/api/client.js` or new helper in `frontend/src/api/`

What to show:
- Last successful sync timestamp
- Last run result (`success` or `failed`)
- Count summary
- Button to trigger manual run (admin only)

Security:
- Manual run button should call admin endpoint requiring `write:remote_ingest`.

Google terms:
- "react polling api status"
- "disable button while async request"

---

## 11) Testing Checklist (Local)

Run these checks in order.

### 11.1 Unit tests

- Date parser handles valid/invalid/timezone variants.
- Filter function includes only new dates.
- Normalizer maps all required fields.

### 11.2 Integration tests

- Ingest once with sample payload -> records inserted.
- Ingest same payload again -> no duplicates.
- Ingest payload with newer date -> one additional insert.

### 11.3 Failure tests

- Simulate network timeout -> run marked failed.
- Simulate DB outage -> non-zero exit code and logged error.

Google terms:
- "pytest monkeypatch requests"
- "psycopg2 integration testing pattern"

---

## 12) Backfill and Recovery Plan

Create a one-time backfill mode:
- Script argument `--from-date YYYY-MM-DD`.
- Process historical data in chunks.
- Commit in batches.

Recovery rules:
- If run fails midway, rerun safely because of upsert/unique constraints.
- Never disable idempotency for backfill.

---

## 13) Practical Implementation Order (Recommended)

Follow this exact order to minimize rework:

1. Add DB unique index/upsert rule.
2. Extract shared persistence service.
3. Build remote ingest service and date filtering.
4. Add CLI runner script.
5. Wire admin API endpoints.
6. Add ingest run logging table + writes.
7. Add frontend sync status panel.
8. Configure Task Scheduler.
9. Run dry-run, then live run.

---

## 14) Example Command Sequence (PowerShell)

Run from repo root.

```powershell
# 1) Activate env
& ".venv\Scripts\Activate.ps1"

# 2) Run one-shot ingestion dry run
python backend/jobs/run_remote_ingest.py --all-sites --dry-run

# 3) Run one-shot live ingestion
python backend/jobs/run_remote_ingest.py --all-sites

# 4) Re-run to verify idempotency (should show skipped/updated but no duplicates)
python backend/jobs/run_remote_ingest.py --all-sites
```

---

## 15) Common Pitfalls

- Putting scheduler loop inside FastAPI process.
- No unique key on natural business key.
- Comparing date strings lexicographically instead of real date objects.
- Assuming all remote fields are always present.
- Not logging failed runs.
- Frontend manually triggering ingestion without proper permission.

---

## 16) Definition of Done

You are done when all are true:

- Scheduled job runs automatically.
- New remote dates are inserted.
- Repeat runs do not duplicate records.
- Failed runs are visible in logs/status.
- Admin can run on-demand sync from API/UI.
- ViewData page shows last sync status clearly.

---

## 17) Optional Enhancements

- Add alerting (email/Slack) on failed ingest.
- Add checksum/hash comparison for change detection beyond date.
- Add pagination/parallel fetch for many sites.
- Move scheduler to cloud-managed scheduler when deployed.

Google terms:
- "slack webhook python error alert"
- "eventbridge schedule lambda"
