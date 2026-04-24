from django.urls import path

from .views import (
    IntegrationSettingsView,
    TelegramZReportSendView,
    WhatsAppDebtReminderView,
)

urlpatterns = [
    path("settings/", IntegrationSettingsView.as_view()),
    path("telegram/send-z-report/", TelegramZReportSendView.as_view()),
    path("whatsapp/remind/", WhatsAppDebtReminderView.as_view()),
]

