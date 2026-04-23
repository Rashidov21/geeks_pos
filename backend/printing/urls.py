from django.urls import path

from .views import ReceiptEscposView, ReceiptPayloadView

urlpatterns = [
    path("receipt/<uuid:sale_id>/", ReceiptPayloadView.as_view()),
    path("receipt/<uuid:sale_id>/escpos/", ReceiptEscposView.as_view()),
]
