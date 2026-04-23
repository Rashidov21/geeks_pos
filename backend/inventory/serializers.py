from rest_framework import serializers

from .models import InventoryMovement


class ReceiveSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    qty = serializers.IntegerField(min_value=1)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class AdjustSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    qty_delta = serializers.IntegerField()
    note = serializers.CharField(required=False, allow_blank=True, default="")
