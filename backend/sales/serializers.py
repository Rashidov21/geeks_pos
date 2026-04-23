from decimal import Decimal

from rest_framework import serializers


class SaleLineInSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    qty = serializers.IntegerField(min_value=1)
    line_discount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        default=Decimal("0"),
    )


class PaymentInSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=["CASH", "CARD", "DEBT"])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class CustomerInSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    name = serializers.CharField(required=False, allow_blank=True)
    phone_normalized = serializers.CharField(required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class CompleteSaleSerializer(serializers.Serializer):
    lines = SaleLineInSerializer(many=True)
    payments = PaymentInSerializer(many=True)
    customer = CustomerInSerializer(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")
