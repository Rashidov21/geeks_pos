from django.urls import path

from .views import AdjustView, ReceiveView

urlpatterns = [
    path("receive/", ReceiveView.as_view()),
    path("adjust/", AdjustView.as_view()),
]
