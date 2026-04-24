from django.urls import path

from .views import CsrfView, LoginView, LogoutView, MeView, PinLoginView, PinUsersView, SetUserPinView

urlpatterns = [
    path("csrf/", CsrfView.as_view()),
    path("login/", LoginView.as_view()),
    path("pin-users/", PinUsersView.as_view()),
    path("pin-login/", PinLoginView.as_view()),
    path("set-pin/", SetUserPinView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("me/", MeView.as_view()),
]
