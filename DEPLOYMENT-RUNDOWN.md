# Deployment Rundown — Goose Creek Association Database Project

Last updated: 2026-05-25

This document is a Docker-first deployment guide for the application. It explains what Docker is, how to package this repo into containers, how to run the app with `docker-compose`, how to publish images, how to schedule background jobs, and how to operate the system in production.

## What you need to know about Docker

Docker packages an application and its dependencies into an image. A running image is a container. For this project, Docker is useful because it gives you the same runtime locally and in production.

The core terms are:

- Image: a build artifact that contains your app and its runtime dependencies.
- Container: a running instance of an image.
- Dockerfile: the recipe used to build an image.
- Registry: a place to store and distribute images, such as Docker Hub or GitHub Container Registry.
- Volume: persistent storage that survives container restarts.
- docker-compose: a tool for running multiple containers together from one YAML file.

If you only remember one thing: build the backend and frontend into images, run Postgres in a persistent container or use a managed Postgres service, and keep secrets out of the image by passing them in as environment variables.

## What this app contains

This repository has three main pieces:

- A FastAPI backend in `backend/` that serves APIs for surveys, forecasting, authentication, CSV ingestion, and remote scrape triggers.
- A React + Vite frontend in `frontend/` that handles login, dashboards, charts, CSV import, and PDF export.
- Background scripts in `backend/scripts/` for scraping remote survey data and retraining forecasting models.

Key files to be aware of:

- `backend/app/server.py`
- `backend/api/auth.py`
- `backend/api/surveys.py`
- `backend/api/forecasting.py`
- `backend/services/csv_processor.py`
- `backend/services/ml_service.py`
- `backend/scripts/web_scrape_script.py`
- `backend/scripts/retrain_forecast_models.py`
- `frontend/src/pdf/generatePdf.js`
- `frontend/src/components/Dashboard.jsx`

## Environment and accounts

Before deployment, make sure you have:

- A Postgres database, either managed or self-hosted.
- An Auth0 tenant or equivalent OpenID Connect provider.
- A container registry if you want to deploy from built images.
- A host that can run Docker, such as a VM or a container-capable PaaS.
- A domain name and TLS certificate for production access.

## Environment variables

Backend variables:

- `DATABASE_URL`
- `AUTH0_DOMAIN`
- `AUTH0_AUDIENCE`
- `AUTH0_ALGORITHMS`

Frontend build-time variables:

- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`
- `VITE_AUTH0_AUDIENCE`
- `VITE_AUTH0_REDIRECT_URI`

Do not put production secrets into the repository. Keep them in a local `.env` file for development or in your host's secret manager for production.

## Database setup

The backend expects Postgres tables for surveys, child survey data, and model storage. At minimum, the database needs the structures used by the survey persistence and forecasting code.

Important tables referenced in the codebase include:

- `surveys`
- `macro_taxa`
- `collection_times`
- `survey_metrics`
- `ml_models`

If you do not already have a migration tool, add one before production. Alembic is the usual choice for a Python backend. The basic production workflow is:

1. Provision a Postgres database.
2. Create the schema in a migration or one-time SQL script.
3. Run the migration against staging.
4. Run the migration against production.
5. Verify that the backend can read and write rows.

A few practical rules:

- Use backups.
- Add indexes for frequently queried columns.
- Test restore before you need it.

## Auth0 setup

The backend validates bearer tokens and checks permissions. Configure Auth0 so the frontend and backend agree on the same audience.

Suggested scopes used by the application:

- `read:view_data`
- `write:manual_submit`
- `write:csv_upload`

Setup steps:

1. Create an API in Auth0.
2. Set the API identifier to the same value you will use for `AUTH0_AUDIENCE`.
3. Create a Single Page Application for the frontend.
4. Add allowed callback URLs, logout URLs, and web origins.
5. Grant users the permissions required for the features they should access.

The most common failure here is a mismatch between the audience requested by the frontend and the audience expected by the backend.

## Local development check

Before containerizing anything, confirm the app works locally.

Backend:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
& .\.venv\Scripts\Activate.ps1
uvicorn backend.app.server:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

A quick sanity checklist:

- Sign in through Auth0.
- Open the dashboard.
- Load survey data.
- Upload a CSV file.
- Trigger a scrape if your account has permission.
- Export a PDF report.

## Docker files to create

Create two Dockerfiles at the repository root:

- `Dockerfile.backend`
- `Dockerfile.frontend`

### Backend Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y build-essential libpq-dev --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ ./backend/
COPY requirements.txt ./requirements.txt

RUN python -m pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "backend.app.server:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontend Dockerfile

```dockerfile
FROM node:18-alpine AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/ ./frontend/

RUN cd frontend && npm ci && npm run build

FROM nginx:stable-alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## docker-compose example

Use `docker-compose` to run Postgres, the backend, and the frontend together.

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - db_data:/var/lib/postgresql/data

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    depends_on:
      - db
    env_file: .env
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - AUTH0_DOMAIN=${AUTH0_DOMAIN}
      - AUTH0_AUDIENCE=${AUTH0_AUDIENCE}
      - AUTH0_ALGORITHMS=${AUTH0_ALGORITHMS}
    ports:
      - "8000:8000"
    volumes:
      - ./backend-logs:/app/backend-logs
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
    restart: unless-stopped

volumes:
  db_data:
```

Example `.env` file:

```env
POSTGRES_USER=gca
POSTGRES_PASSWORD=changeme
POSTGRES_DB=gca
DATABASE_URL=postgresql://gca:changeme@db:5432/gca
AUTH0_DOMAIN=dev-xxxxx.us.auth0.com
AUTH0_AUDIENCE=https://api.goosecreekassociation.org
AUTH0_ALGORITHMS=RS256
```

## Build and run with Docker

From the repository root:

```powershell
docker-compose up -d --build
```

Useful follow-up commands:

```powershell
docker-compose ps
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose down
```

If you need to rebuild a single service:

```powershell
docker-compose build backend
docker-compose up -d backend
```

## Publishing images

Once the images work locally, push them to a registry so your production host can pull them.

Docker Hub example:

```bash
docker build -t yourdockerhubuser/gca-backend:1.0 -f Dockerfile.backend .
docker build -t yourdockerhubuser/gca-frontend:1.0 -f Dockerfile.frontend .
docker login
docker push yourdockerhubuser/gca-backend:1.0
docker push yourdockerhubuser/gca-frontend:1.0
```

GitHub Container Registry example:

```bash
docker build -t ghcr.io/yourorg/gca-backend:1.0 -f Dockerfile.backend .
docker build -t ghcr.io/yourorg/gca-frontend:1.0 -f Dockerfile.frontend .
docker push ghcr.io/yourorg/gca-backend:1.0
docker push ghcr.io/yourorg/gca-frontend:1.0
```

After that, your server can use image references instead of local builds.

## Background jobs

The app includes scripts for scraping and retraining:

- `backend/scripts/web_scrape_script.py`
- `backend/scripts/retrain_forecast_models.py`

For production, do not depend on a browser session to run these. Run them as scheduled container jobs or one-off container commands.

Examples:

```bash
docker-compose run --rm backend python backend/scripts/web_scrape_script.py
docker-compose run --rm backend python backend/scripts/retrain_forecast_models.py
```

If you use a Linux host, you can also schedule a cron entry that runs a container at specific times.

## CI/CD with Docker

A simple GitHub Actions flow can do the following:

- Build the backend image.
- Build the frontend image.
- Run tests.
- Push images to a registry.
- SSH into the server and restart the stack.

The easiest production deployment pattern is:

1. Push to `main`.
2. CI builds images.
3. CI pushes images to a registry.
4. Production host runs `docker-compose pull`.
5. Production host runs `docker-compose up -d`.

## Monitoring and logs

The backend writes rotating log files under `backend-logs/`. In production you should collect those logs centrally or at least mount them to a persistent volume.

Things to monitor:

- Backend startup failures.
- Authentication failures.
- CSV import errors.
- Scrape failures.
- Retrain job failures.
- Database connectivity issues.

A simple uptime check against the backend is also a good idea.

## Security checklist

- Keep secrets out of Docker images.
- Restrict database access.
- Use TLS for public traffic.
- Use strong Auth0 permissions.
- Do not give the scrape or retrain permissions to normal users.
- Back up the database regularly.
- Keep Docker images and dependencies updated.

## Troubleshooting

If the backend will not start in Docker:

- Confirm `DATABASE_URL` is correct.
- Confirm Postgres is reachable from the backend container.
- Confirm your Auth0 settings match the container environment variables.
- Check `docker-compose logs -f backend`.

If the frontend cannot talk to the backend:

- Check the frontend build-time environment variables.
- Confirm CORS settings.
- Confirm the backend is listening on the expected port.

If a background job fails:

- Run the script directly in a container.
- Check the log file in `backend-logs/`.
- Confirm the database and remote source are reachable.

## Recommended deployment flow

For a straightforward deployment, use this order:

1. Get the app working locally.
2. Build Docker images.
3. Run the stack with `docker-compose`.
4. Push images to a registry.
5. Move the same compose setup to the production host.
6. Add scheduled container runs for scraping and retraining.
7. Monitor logs and backups.

If you want, I can now create the actual Docker files in the repo and make them ready to run.
