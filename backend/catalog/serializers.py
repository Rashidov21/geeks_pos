from rest_framework import serializers

from .models import Category, Color, Product, ProductVariant, Size


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name_uz", "name_ru", "sort_order", "deleted_at"]


class SizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Size
        fields = ["id", "value", "label_uz", "label_ru", "sort_order"]


class ColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Color
        fields = ["id", "value", "label_uz", "label_ru", "sort_order"]


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "id",
            "category",
            "name_uz",
            "name_ru",
            "is_active",
            "deleted_at",
        ]


class ProductVariantSerializer(serializers.ModelSerializer):
    product_name_uz = serializers.CharField(source="product.name_uz", read_only=True)
    size_label_uz = serializers.CharField(source="size.label_uz", read_only=True)
    color_label_uz = serializers.CharField(source="color.label_uz", read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id",
            "product",
            "product_name_uz",
            "size",
            "size_label_uz",
            "color",
            "color_label_uz",
            "barcode",
            "purchase_price",
            "list_price",
            "stock_qty",
            "is_active",
            "deleted_at",
        ]

    def update(self, instance, validated_data):
        # Stock is ledger-driven and must not be mutated from catalog edits.
        validated_data.pop("stock_qty", None)
        return super().update(instance, validated_data)


class BulkGridCellSerializer(serializers.Serializer):
    size_id = serializers.UUIDField()
    color_id = serializers.UUIDField()
    purchase_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    list_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    initial_qty = serializers.IntegerField(required=False, default=0)


class BulkGridSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    matrix = BulkGridCellSerializer(many=True)
