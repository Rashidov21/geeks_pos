from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Enable WAL for SQLite (better concurrency for single-writer bursts)
        from django.db.backends.signals import connection_created

        def _pragma(sender, connection, **kwargs):
            if connection.vendor == "sqlite":
                with connection.cursor() as c:
                    c.execute("PRAGMA journal_mode=WAL;")
                    c.execute("PRAGMA busy_timeout=30000;")

        connection_created.connect(_pragma)
