"""
Django settings for local MVP (SQLite, localhost API).
"""
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# Load environment variables from local files (root/.env, backend/.env).
load_dotenv(BASE_DIR.parent / ".env", override=False)
load_dotenv(BASE_DIR / ".env", override=False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-in-production-geeks-pos-mvp")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
if not DEBUG and (
    not SECRET_KEY or SECRET_KEY == "dev-only-change-in-production-geeks-pos-mvp"
):
    raise RuntimeError("DJANGO_SECRET_KEY must be set when DEBUG=0")
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "core.apps.CoreConfig",
    "accounts.apps.AccountsConfig",
    "catalog",
    "inventory",
    "sales",
    "debt",
    "printing",
    "sync",
    "reports",
    "integrations",
    "licensing.apps.LicensingConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "licensing.middleware.LicenseEnforcementMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
        "OPTIONS": {"timeout": 30},
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "uz"
TIME_ZONE = "Asia/Tashkent"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}

CORS_ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://tauri.localhost",
]
CORS_ALLOW_CREDENTIALS = True

# License / Owner Dashboard (set in production)
LICENSE_API_BASE_URL = os.environ.get("LICENSE_API_BASE_URL", "").strip()
LICENSE_AUTH_TOKEN = os.environ.get("LICENSE_AUTH_TOKEN", "").strip()
LICENSE_CLIENT_API_KEY = os.environ.get("LICENSE_CLIENT_API_KEY", "").strip()
LICENSE_ENFORCEMENT = os.environ.get("LICENSE_ENFORCEMENT", "0" if DEBUG else "1") == "1"
LICENSE_OFFLINE_GRACE_HOURS = int(os.environ.get("LICENSE_OFFLINE_GRACE_HOURS", "72"))
LICENSE_DEMO_DAYS = int(os.environ.get("LICENSE_DEMO_DAYS", "14"))
INTERNAL_FLUSH_KEY = os.environ.get("INTERNAL_FLUSH_KEY", "").strip()
if DEBUG and not INTERNAL_FLUSH_KEY:
    INTERNAL_FLUSH_KEY = "dev-internal-flush-key"

CSRF_TRUSTED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "audit": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
