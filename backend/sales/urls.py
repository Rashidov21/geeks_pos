from django.urls import path

from .views import CompleteSaleView, SaleDetailView

urlpatterns = [
    path("complete/", CompleteSaleView.as_view()),
    path("<uuid:pk>/", SaleDetailView.as_view()),
]
