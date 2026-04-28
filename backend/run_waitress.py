"""
Run Geeks POS API on 127.0.0.1 with Waitress (production-style local server).

Usage:
  python run_waitress.py
  python run_waitress.py --port 8765

Tauri/desktop should spawn this script (or `waitress-serve`) after the app starts.
"""
import argparse
import os
import time
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def _bootstrap_db(max_attempts: int = 5) -> None:
    """
    First-run provisioning for packaged desktop:
    - apply migrations
    - ensure default users + PIN
    Retries transient SQLite lock errors.
    """
    from django.core.management import call_command

    for attempt in range(1, max_attempts + 1):
        try:
            call_command("migrate", interactive=False, verbosity=0)
            from accounts.bootstrap import ensure_default_users_and_pins

            ensure_default_users_and_pins()
            print("Bootstrap OK: migrations + default users.")
            return
        except Exception as exc:
            msg = str(exc).lower()
            retriable = "database is locked" in msg or "locked" in msg
            if attempt >= max_attempts or not retriable:
                raise
            wait_s = min(8, 2 * attempt)
            print(f"Bootstrap retry {attempt}/{max_attempts} after lock: {exc}")
            time.sleep(wait_s)


def _bootstrap_marker_path() -> Path:
    appdata = os.environ.get("APPDATA")
    base = Path(appdata) / "GeeksPOS" if appdata else Path(__file__).resolve().parent.parent / ".geeks_pos"
    base.mkdir(parents=True, exist_ok=True)
    return base / ".bootstrap_done"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--threads", type=int, default=int(os.environ.get("WAITRESS_THREADS", "2")))
    parser.add_argument("--skip-bootstrap", action="store_true")
    parser.add_argument("--force-bootstrap", action="store_true")
    args = parser.parse_args()

    from django.core.wsgi import get_wsgi_application
    from waitress import serve

    marker = _bootstrap_marker_path()
    should_bootstrap = not args.skip_bootstrap and (args.force_bootstrap or not marker.exists())
    if should_bootstrap:
        print("BOOTSTRAP_START")
        _bootstrap_db()
        marker.write_text(str(int(time.time())), encoding="utf-8")
        print("BOOTSTRAP_DONE")
    else:
        print("BOOTSTRAP_SKIPPED")

    application = get_wsgi_application()
    print(f"Geeks POS API: http://{args.host}:{args.port}/")
    serve(application, host=args.host, port=args.port, threads=max(1, args.threads))


if __name__ == "__main__":
    main()
