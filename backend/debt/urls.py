from django.urls import path

from .views import (
    CustomerCreateView,
    CustomerSearchView,
    DebtPaymentView,
    OpenDebtsView,
)

urlpatterns = [
    path("customers/search/", CustomerSearchView.as_view()),
    path("customers/", CustomerCreateView.as_view()),
    path("debts/open/", OpenDebtsView.as_view()),
    path("payments/", DebtPaymentView.as_view()),
]
