from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from backend.api.health import router as health_router
from backend.api.surveys import router as surveys_router

app = FastAPI()
ROOT_DIR = Path(__file__).resolve().parents[2]
templates = Jinja2Templates(directory=str(ROOT_DIR / "templates"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(ROOT_DIR / "static")), name="static")

app.include_router(health_router)
app.include_router(surveys_router)


@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"request": request},
    )


@app.get("/data-entry")
def data_entry(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="data-entry.html",
        context={"request": request},
    )