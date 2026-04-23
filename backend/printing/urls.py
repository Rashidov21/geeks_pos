from django.urls import path

from .views import ReceiptEscposView, ReceiptPayloadView, StoreSettingsView

urlpatterns = [
    path("settings/", StoreSettingsView.as_view()),
    path("receipt/<uuid:sale_id>/", ReceiptPayloadView.as_view()),
    path("receipt/<uuid:sale_id>/escpos/", ReceiptEscposView.as_view()),
]
