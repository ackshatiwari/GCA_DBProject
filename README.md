# GCA Database Project

This project is a survey data platform for collecting, storing, viewing, and forecasting macroinvertebrate survey data. It combines a FastAPI backend, a React/Vite frontend, Auth0-based access control, and a PostgreSQL database hosted in Neon or a compatible Postgres instance.

## What the app does

The application supports three main workflows:

1. Manual data entry for survey records.
2. CSV or Excel import for batch survey ingestion.
3. Viewing site data and generating organism forecasts from historical survey records.

The backend validates requests with Auth0 JWTs, writes survey data into Postgres, and exposes read APIs for site coordinates, site details, and forecasting. The frontend provides the user interface for login, data entry, and data review.

## Architecture

### Tech Stack

- Backend: FastAPI, Pydantic, psycopg2, pandas, NumPy, scikit-learn, and statsmodels
- Frontend: React, Vite, Auth0 React SDK, Recharts, Mapbox, and react-select
- Authentication: Auth0 JWT bearer tokens with permission-based access control
- Database: PostgreSQL, including Neon-hosted deployments
- File handling: CSV and XLSX import support with openpyxl for Excel parsing

### Backend

The backend lives under `backend/` and is built with FastAPI.

- `backend/app/server.py` loads environment variables from `.env`, configures CORS, mounts static assets, and registers the API routers.
- `backend/api/auth.py` validates Auth0 bearer tokens and checks permissions such as `write:manual_submit`, `write:csv_upload`, and `read:view_data`.
- `backend/api/surveys.py` handles manual survey submission, CSV/XLSX import, site coordinate lookup, and site detail queries.
- `backend/api/forecasting.py` generates forecasts for a site and organism using the shared ML service.
- `backend/services/` contains the data processing and persistence logic, including CSV parsing, database upserts, and forecasting helpers.
- `backend/schemas/` defines the request payload models used by the API.

### Frontend

The frontend lives under `frontend/` and is built with React and Vite.

- `frontend/src/main.jsx` initializes the app and wraps it in the Auth0 provider.
- `frontend/src/App.jsx` controls navigation and shows the main app views based on permissions.
- `frontend/src/components/` contains the user-facing pages for authentication, data entry, importing, viewing data, and charting forecast output.

### Data flow

1. A user signs in through Auth0.
2. The frontend requests an access token and reads permissions from the token payload.
3. The backend verifies the bearer token and permission scope before allowing protected operations.
4. Survey data is written to Postgres, including parent survey rows and related child records.
5. View and forecasting endpoints read aggregated survey history back from the database.

## Repository layout

- `backend/` FastAPI app, API routes, service layer, and tests
- `frontend/` React/Vite app
- `templates/` legacy or server-rendered HTML templates used by the FastAPI app
- `static/` static CSS and other assets served by the backend

## Prerequisites

- Python 3.11 or newer
- Node.js 18 or newer
- A Postgres database with the expected survey tables
- An Auth0 application with an API configured for this backend

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd GCA_DBProject
```

### 2. Configure the backend

Create a `.env` file in the project root with at least these values:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=your-auth0-api-audience
AUTH0_ALGORITHMS=RS256
```

Install the Python dependencies that the backend uses:

```bash
python -m pip install fastapi uvicorn psycopg2-binary python-jose[cryptography] pandas numpy scikit-learn statsmodels openpyxl python-multipart jinja2
```

Start the backend from the project root:

```bash
uvicorn backend.app.server:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

### 3. Configure the frontend

Install frontend dependencies:

```bash
cd frontend
npm install
```

Create `frontend/.env` with the Auth0 values used by the React app:

```env
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-auth0-client-id
VITE_AUTH0_AUDIENCE=your-auth0-api-audience
VITE_AUTH0_REDIRECT_URI=http://localhost:5173
```

Start the frontend:

```bash
npm run dev
```

The UI will be available at the Vite development URL, usually `http://localhost:5173`.

## Running the app

With both services running:

1. Open the frontend in a browser and log in through Auth0.
2. Use the navigation to enter survey data, upload a CSV/XLSX file, or view stored data.
3. The backend writes to and reads from the configured Postgres database.

## Tests

Backend tests live under `backend/tests/`. Run them from the project root with your preferred test runner after installing the backend dependencies.

## Notes

- The backend accepts CSV and Excel uploads for survey import.
- Protected routes require the appropriate Auth0 permission claims.
- Forecasting currently supports automatic selection between linear regression and exponential smoothing based on available history.
