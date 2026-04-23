from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import ProductVariant
from core.exceptions import InsufficientStock

from .models import InventoryMovement
from .serializers import AdjustSerializer, ReceiveSerializer
from .services import apply_movement


class ReceiveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ReceiveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        v = ProductVariant.objects.get(pk=ser.validated_data["variant_id"])
        apply_movement(
            variant=v,
            qty_delta=ser.validated_data["qty"],
            movement_type=InventoryMovement.Type.IN,
            user=request.user,
            note=ser.validated_data.get("note") or "",
        )
        v.refresh_from_db()
        return Response({"variant_id": str(v.id), "stock_qty": v.stock_qty})


class AdjustView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = AdjustSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        v = ProductVariant.objects.get(pk=ser.validated_data["variant_id"])
        delta = ser.validated_data["qty_delta"]
        try:
            apply_movement(
                variant=v,
                qty_delta=delta,
                movement_type=InventoryMovement.Type.ADJUST,
                user=request.user,
                note=ser.validated_data.get("note") or "",
            )
        except InsufficientStock as e:
            return Response({"code": e.code, "detail": str(e)}, status=409)
        v.refresh_from_db()
        return Response({"variant_id": str(v.id), "stock_qty": v.stock_qty})
