import os
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))


def pytest_configure(config):
    config.addinivalue_line("markers", "live: runs the real engine and the real judge backend")
    try:
        import fastapi  # noqa: F401
    except ImportError:
        # `uv run --with pytest pytest` has no project to read, so take the deps from app.py's inline metadata.
        if os.environ.get("HPI_TEST_REEXEC"):
            raise
        config.pluginmanager.getplugin("capturemanager").stop_global_capturing()
        os.environ["HPI_TEST_REEXEC"] = "1"
        os.execvp("uv", ["uv", "run", "-q", "--with", "pytest", "--with-requirements", str(SERVER / "app.py"),
                         "python", "-m", "pytest", *sys.argv[1:]])
