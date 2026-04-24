from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import ProductVariant
from core.exceptions import InsufficientStock
from core.permissions import IsAdminOrOwner

from .models import InventoryMovement, StocktakeSession
from .serializers import (
    AdjustSerializer,
    ReceiveSerializer,
    StocktakeCountSerializer,
    StocktakeSessionCreateSerializer,
    StocktakeSessionSerializer,
)
from .services import (
    apply_movement,
    apply_stocktake,
    create_stocktake_session,
    set_stocktake_count,
)


class ReceiveView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

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
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

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


class StocktakeSessionCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        ser = StocktakeSessionCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        session = create_stocktake_session(
            user=request.user, note=ser.validated_data.get("note") or ""
        )
        return Response(StocktakeSessionSerializer(session).data, status=201)


class StocktakeSessionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request, session_id):
        session = StocktakeSession.objects.prefetch_related("lines__variant__product").get(
            pk=session_id
        )
        return Response(StocktakeSessionSerializer(session).data)


class StocktakeCountView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request, session_id):
        session = StocktakeSession.objects.get(pk=session_id)
        ser = StocktakeCountSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        v = ProductVariant.objects.get(pk=ser.validated_data["variant_id"])
        line = set_stocktake_count(
            session=session,
            variant=v,
            counted_qty=ser.validated_data["counted_qty"],
            user=request.user,
        )
        return Response(
            {
                "session_id": str(session.id),
                "variant_id": str(v.id),
                "expected_qty": line.expected_qty,
                "counted_qty": line.counted_qty,
                "variance_qty": line.variance_qty,
            }
        )


class StocktakeApplyView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request, session_id):
        session = StocktakeSession.objects.get(pk=session_id)
        session = apply_stocktake(session=session, user=request.user)
        return Response(
            {
                "session_id": str(session.id),
                "status": session.status,
                "applied_at": session.applied_at,
            }
        )


class StocktakeSessionListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        status = request.query_params.get("status")
        qs = StocktakeSession.objects.order_by("-created_at")
        if status:
            qs = qs.filter(status=status)
        data = [
            {
                "id": str(s.id),
                "status": s.status,
                "note": s.note,
                "created_at": s.created_at,
                "applied_at": s.applied_at,
            }
            for s in qs[:50]
        ]
        return Response(data)
