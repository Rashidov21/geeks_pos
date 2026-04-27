from django.apps import AppConfig

_AUTO_Z_THREAD_STARTED = False


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Enable WAL for SQLite (better concurrency for single-writer bursts)
        import logging
        import os
        import sys
        import threading
        import time

        from django.utils import timezone
        from django.db.utils import OperationalError
        from django.db.backends.signals import connection_created

        def _pragma(sender, connection, **kwargs):
            if connection.vendor == "sqlite":
                with connection.cursor() as c:
                    try:
                        c.execute("PRAGMA journal_mode=WAL;")
                    except OperationalError:
                        # Another process can temporarily hold a lock during startup.
                        # Keep serving with busy_timeout; next connections will retry WAL.
                        pass
                    c.execute("PRAGMA busy_timeout=30000;")

        connection_created.connect(_pragma)

        global _AUTO_Z_THREAD_STARTED
        if _AUTO_Z_THREAD_STARTED:
            return
        if os.environ.get("ENABLE_AUTO_Z_SCHEDULER", "0") != "1":
            return
        # Django runserver autoreload spawns parent/child; run scheduler only in child.
        if "runserver" in sys.argv and os.environ.get("RUN_MAIN") != "true":
            return

        _AUTO_Z_THREAD_STARTED = True
        logger = logging.getLogger(__name__)
        hhmm = (os.environ.get("AUTO_Z_REPORT_TIME", "20:00") or "20:00").strip()
        try:
            target_hour, target_minute = [int(x) for x in hhmm.split(":", 1)]
        except Exception:
            target_hour, target_minute = 20, 0

        def _loop():
            while True:
                try:
                    now = timezone.localtime()
                    if now.hour == target_hour and now.minute == target_minute:
                        from integrations.services import run_auto_daily_z_report_if_due

                        result = run_auto_daily_z_report_if_due(now=now)
                        logger.info("Auto Z-report scheduler tick: %s", result)
                        time.sleep(65)
                        continue
                except Exception as exc:
                    logger.warning("Auto Z-report scheduler error: %s", exc)
                time.sleep(20)

        t = threading.Thread(target=_loop, name="auto-z-report-scheduler", daemon=True)
        t.start()
