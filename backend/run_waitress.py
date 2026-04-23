"""
Run Geeks POS API on 127.0.0.1 with Waitress (production-style local server).

Usage:
  python run_waitress.py
  python run_waitress.py --port 8765

Tauri/desktop should spawn this script (or `waitress-serve`) after the app starts.
"""
import argparse
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    from django.core.wsgi import get_wsgi_application
    from waitress import serve

    application = get_wsgi_application()
    print(f"Geeks POS API: http://{args.host}:{args.port}/")
    serve(application, host=args.host, port=args.port, threads=4)


if __name__ == "__main__":
    main()
