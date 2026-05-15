from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_LOG_DIR = _PROJECT_ROOT / "backend-logs"


class WindowsSafeRotatingFileHandler(RotatingFileHandler):
    """Windows-safe version of RotatingFileHandler that gracefully handles file lock errors."""
    
    def doRollover(self):
        """Override to catch Windows file lock errors during rotation."""
        try:
            super().doRollover()
        except PermissionError:
            # On Windows, the file may be locked. Skip rollover silently.
            pass


def get_file_logger(name: str, log_filename: str = "backend.log") -> logging.Logger:
    """Return a module logger that writes to backend-logs/<log_filename>."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = _LOG_DIR / log_filename

    handler = WindowsSafeRotatingFileHandler(
        log_path,
        maxBytes=2_000_000,
        backupCount=5,
        encoding="utf-8",
        delay=True, 
    )
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.propagate = False
    return logger
