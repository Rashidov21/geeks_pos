from django.db.models import Q
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsCashier

from .models import Customer, Debt
from .serializers import CustomerSerializer, DebtPaymentSerializer, DebtSerializer
from .services import record_debt_payment


class CustomerSearchView(generics.ListAPIView):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsCashier]

    def get_queryset(self):
        q = (self.request.query_params.get("q") or "").strip()
        if not q:
            return Customer.objects.none()
        return Customer.objects.filter(
            Q(name__icontains=q) | Q(phone_normalized__icontains=q)
        )[:50]


class CustomerCreateView(generics.CreateAPIView):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsCashier]


class OpenDebtsView(generics.ListAPIView):
    serializer_class = DebtSerializer
    permission_classes = [IsAuthenticated, IsCashier]

    def get_queryset(self):
        return Debt.objects.filter(status=Debt.Status.OPEN).select_related("customer")


class DebtPaymentView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        ser = DebtPaymentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        cust = Customer.objects.get(pk=ser.validated_data["customer_id"])
        touched = record_debt_payment(
            customer=cust,
            amount=ser.validated_data["amount"],
            user=request.user,
        )
        return Response(DebtSerializer(touched, many=True).data)
