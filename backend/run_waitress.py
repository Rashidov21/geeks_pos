"""
Run Geeks POS API on 127.0.0.1 with Waitress (production-style local server).

Usage:
  python run_waitress.py
  python run_waitress.py --port 8765
  python run_waitress.py --self-check   # Django setup + migrate only, then exit 0

Tauri/desktop should spawn this script (or `waitress-serve`) after the app starts.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import traceback
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# PyInstaller onefile: modullar arxivdan chiqarilgan papkada; ba’zi muhitlarda import tartibini mustahkamlash.
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    meipass = sys._MEIPASS
    if meipass not in sys.path:
        sys.path.insert(0, meipass)


def _bootstrap_marker_dir() -> Path:
    """Writable GeeksPOS dir for bootstrap marker (mirrors settings fallbacks before Django loads)."""
    for key in ("APPDATA", "LOCALAPPDATA"):
        v = os.environ.get(key)
        if v:
            base = Path(v) / "GeeksPOS"
            try:
                base.mkdir(parents=True, exist_ok=True)
                return base
            except OSError:
                continue
    fallback = Path.home() / "GeeksPOS"
    try:
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback
    except OSError:
        return Path(__file__).resolve().parent.parent / ".geeks_pos"


def _bootstrap_marker_path() -> Path:
    base = _bootstrap_marker_dir()
    try:
        base.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return base / ".bootstrap_done"


def _run_migrations_with_retry(max_attempts: int = 5) -> None:
    """
    Apply migrations after full Django initialization.

    call_command('migrate') must run only after django.setup(); otherwise
    AppRegistryNotReady / translation errors occur in packaged PyInstaller builds.
    """
    import django
    from django.core.management import call_command

    django.setup()

    for attempt in range(1, max_attempts + 1):
        try:
            from accounts.bootstrap import ensure_default_users_and_pins
            call_command("migrate", interactive=False, verbosity=0)
            ensure_default_users_and_pins()
            print("Migrations OK.")
            return
        except Exception as exc:
            msg = str(exc).lower()
            retriable = "database is locked" in msg or "locked" in msg
            print(f"MIGRATE_ATTEMPT_{attempt}: {type(exc).__name__}: {exc}", file=sys.stderr)
            if attempt >= max_attempts or not retriable:
                traceback.print_exc(file=sys.stderr)
                raise
            wait_s = min(8, 2 * attempt)
            print(f"Bootstrap retry {attempt}/{max_attempts} after lock: {exc}")
            time.sleep(wait_s)


def _self_check() -> int:
    """Smoke test for CI / post-build: setup + migrate + URL import resolution."""
    try:
        print("SELF_CHECK_START")
        from django.conf import settings
        print(f"DB_PATH={settings.DATABASES['default']['NAME']}")
        _run_migrations_with_retry()
        from django.urls import get_resolver

        # Force URLConf loading so dynamic include("config.api_urls")/include("*.urls")
        # failures are caught during build-time self-check.
        _ = get_resolver().url_patterns
        print("URLCONF_OK")
        print("SELF_CHECK_OK")
        return 0
    except Exception as exc:
        print(f"SELF_CHECK_FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--threads", type=int, default=int(os.environ.get("WAITRESS_THREADS", "2")))
    parser.add_argument("--skip-bootstrap", action="store_true")
    parser.add_argument("--force-bootstrap", action="store_true")
    parser.add_argument(
        "--self-check",
        action="store_true",
        help="Run django.setup + migrate then exit (for build smoke tests).",
    )
    args = parser.parse_args()

    if args.self_check:
        raise SystemExit(_self_check())

    from django.core.wsgi import get_wsgi_application
    from waitress import serve

    if not args.skip_bootstrap:
        # Always run migrations on startup (idempotent; upgrades apply new migrations).
        print("BOOTSTRAP_START")
        from django.conf import settings
        print(f"DB_PATH={settings.DATABASES['default']['NAME']}")
        try:
            _run_migrations_with_retry()
        except Exception as exc:
            print(f"BOOTSTRAP_FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            raise

        # First-run marker (optional telemetry / support); never skip migrations when absent.
        marker = _bootstrap_marker_path()
        if args.force_bootstrap or not marker.exists():
            try:
                marker.write_text(str(int(time.time())), encoding="utf-8")
                print("BOOTSTRAP_MARKER_WRITTEN")
            except OSError as werr:
                print(f"WARN: could not write bootstrap marker: {werr}")
        print("BOOTSTRAP_DONE")

    application = get_wsgi_application()
    print(f"Geeks POS API: http://{args.host}:{args.port}/")
    serve(application, host=args.host, port=args.port, threads=max(1, args.threads))


if __name__ == "__main__":
    main()
