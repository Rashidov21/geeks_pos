from django.urls import include, path

urlpatterns = [
    path("", include("core.urls")),
    path("auth/", include("accounts.urls")),
    path("catalog/", include("catalog.urls")),
    path("inventory/", include("inventory.urls")),
    path("sales/", include("sales.urls")),
    path("debt/", include("debt.urls")),
    path("printing/", include("printing.urls")),
    path("sync/", include("sync.urls")),
]
