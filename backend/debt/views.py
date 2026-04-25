from django.db.models import Q
from decimal import Decimal
from django.db.models import Sum
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner

from .models import Customer, Debt
from .serializers import CustomerSerializer, DebtPaymentSerializer, DebtSerializer
from .services import record_debt_payment


class CustomerSearchView(generics.ListAPIView):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

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
    permission_classes = [IsAuthenticated, IsAdminOrOwner]


class CustomerUpdateView(generics.UpdateAPIView):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]


class OpenDebtsView(generics.ListAPIView):
    serializer_class = DebtSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get_queryset(self):
        return Debt.objects.filter(status=Debt.Status.OPEN).select_related("customer")


class DebtPaymentView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        ser = DebtPaymentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            cust = Customer.objects.get(pk=ser.validated_data["customer_id"])
        except Customer.DoesNotExist:
            return Response({"code": "CUSTOMER_NOT_FOUND", "detail": "Customer not found"}, status=404)
        open_before_qs = Debt.objects.filter(customer=cust, status=Debt.Status.OPEN).values("id", "remaining_amount")
        before_map = {str(r["id"]): Decimal(str(r["remaining_amount"])) for r in open_before_qs}
        try:
            touched = record_debt_payment(
                customer=cust,
                amount=ser.validated_data["amount"],
                user=request.user,
            )
        except ValueError as exc:
            return Response({"code": "DEBT_PAYMENT_FAILED", "detail": str(exc)}, status=400)
        # Best-effort debtor notification after payment (does not block API success).
        try:
            from integrations.services import send_whatsapp_reminder

            touched_full = (
                Debt.objects.filter(id__in=[d.id for d in touched])
                .select_related("originating_sale")
                .order_by("due_date", "created_at")
            )
            reminder_items: list[dict[str, str]] = []
            for d in touched_full:
                sale_no = (
                    d.originating_sale.public_sale_no or str(d.originating_sale_id)[:8]
                    if d.originating_sale_id
                    else "-"
                )
                sale_time = (
                    timezone.localtime(d.originating_sale.completed_at).strftime("%Y-%m-%d %H:%M")
                    if d.originating_sale_id and d.originating_sale.completed_at
                    else "-"
                )
                before_remaining = before_map.get(str(d.id), d.remaining_amount)
                paid_now = before_remaining - d.remaining_amount
                reminder_items.append(
                    {
                        "sale_no": sale_no,
                        "total_amount": str(d.total_amount),
                        "paid_now": str(paid_now),
                        "remaining_amount": str(d.remaining_amount),
                        "sale_time": sale_time,
                        "debt_created_at": timezone.localtime(d.created_at).strftime("%Y-%m-%d %H:%M"),
                        "due_date": d.due_date.isoformat() if d.due_date else "-",
                    }
                )
            total_remaining = (
                Debt.objects.filter(customer=cust, status=Debt.Status.OPEN).aggregate(total=Sum("remaining_amount"))["total"]
                or Decimal("0")
            )
            send_whatsapp_reminder(
                phone=cust.phone_normalized,
                customer_name=cust.name,
                amount=str(total_remaining),
                lang=(request.headers.get("Accept-Language") or "uz").split(",")[0],
                debt_items=reminder_items,
                reminder_kind="repayment_update",
                payment_amount=str(ser.validated_data["amount"]),
                payment_time=timezone.localtime().strftime("%Y-%m-%d %H:%M"),
                is_partial=total_remaining > 0,
                total_remaining=str(total_remaining),
            )
        except Exception:
            pass
        return Response(DebtSerializer(touched, many=True).data)
