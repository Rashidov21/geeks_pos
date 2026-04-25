from django.urls import path

from .views import (
    IntegrationSettingsView,
    NotificationQueueFlushView,
    TelegramZReportSendView,
    WhatsAppDebtReminderView,
    ZReportSendView,
)

urlpatterns = [
    path("settings/", IntegrationSettingsView.as_view()),
    path("z-report/send/", ZReportSendView.as_view()),
    path("telegram/send-z-report/", TelegramZReportSendView.as_view()),
    path("whatsapp/remind/", WhatsAppDebtReminderView.as_view()),
    path("notification-queue/flush/", NotificationQueueFlushView.as_view()),
]

