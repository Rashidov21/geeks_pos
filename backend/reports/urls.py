from django.urls import path

from .views import CashierXReportView, DashboardSummaryView

urlpatterns = [
    path("summary/", DashboardSummaryView.as_view()),
    path("cashier-x/", CashierXReportView.as_view()),
]

