from pathlib import Path
import os
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _load_env_file() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ[key] = value


_load_env_file()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from api.health import router as health_router
from api.surveys import router as surveys_router
from api.forecasting import router as forecasting_router

app = FastAPI()
ROOT_DIR = Path(__file__).resolve().parents[1]
templates = Jinja2Templates(directory=str(ROOT_DIR / "templates"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://goosecreek-waterquality.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(ROOT_DIR / "static"), check_dir=False), name="static")


app.include_router(health_router)
app.include_router(surveys_router)
app.include_router(forecasting_router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "GCA Database Project API loading successful",
        "documentation": "/docs"
    }