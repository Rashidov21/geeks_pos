from django.urls import path

from .views import (
    LabelEscposView,
    LabelQueueEscposView,
    HardwareConfigView,
    ReceiptEscposView,
    ReceiptPayloadView,
    StoreSettingsView,
)

urlpatterns = [
    path("settings/", StoreSettingsView.as_view()),
    path("hardware-config/", HardwareConfigView.as_view()),
    path("receipt/<uuid:sale_id>/", ReceiptPayloadView.as_view()),
    path("receipt/<uuid:sale_id>/escpos/", ReceiptEscposView.as_view()),
    path("labels/escpos/", LabelEscposView.as_view()),
    path("labels/queue/escpos/", LabelQueueEscposView.as_view()),
]
