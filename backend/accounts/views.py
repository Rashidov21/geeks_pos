from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import Role


def _resolve_role(user) -> str:
    # Superuser should behave as top-level manager in UI/API checks.
    if getattr(user, "is_superuser", False):
        return str(Role.OWNER)
    profile = getattr(user, "profile", None)
    raw_role = getattr(profile, "role", Role.CASHIER) or Role.CASHIER
    role = str(raw_role).upper()
    if role in {Role.CASHIER, Role.ADMIN, Role.OWNER}:
        return str(role)
    return str(Role.CASHIER)


class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if not user:
            return Response(
                {"code": "INVALID_CREDENTIALS", "detail": "Invalid credentials"}, status=400
            )
        login(request, user)
        role = _resolve_role(user)
        return Response({"username": user.username, "role": role})


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({"ok": True})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        role = _resolve_role(u)
        return Response({"username": u.username, "role": role})
