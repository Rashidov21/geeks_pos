from django.urls import path

from .views import (
    CompleteSaleView,
    SaleDetailView,
    SaleHistoryExportCsvView,
    SaleHistoryView,
    SaleVoidView,
)

urlpatterns = [
    path("", SaleHistoryView.as_view()),
    path("export/csv/", SaleHistoryExportCsvView.as_view()),
    path("complete/", CompleteSaleView.as_view()),
    path("<uuid:pk>/void/", SaleVoidView.as_view()),
    path("<uuid:pk>/", SaleDetailView.as_view()),
]
