from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Color, Product, ProductVariant, Size
from .serializers import (
    BulkGridSerializer,
    CategorySerializer,
    ColorSerializer,
    ProductSerializer,
    ProductVariantSerializer,
    SizeSerializer,
)
from .services import bulk_create_variant_grid


class CategoryListCreate(generics.ListCreateAPIView):
    queryset = Category.objects.filter(deleted_at__isnull=True)
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]


class SizeListCreate(generics.ListCreateAPIView):
    queryset = Size.objects.all()
    serializer_class = SizeSerializer
    permission_classes = [IsAuthenticated]


class ColorListCreate(generics.ListCreateAPIView):
    queryset = Color.objects.all()
    serializer_class = ColorSerializer
    permission_classes = [IsAuthenticated]


class ProductListCreate(generics.ListCreateAPIView):
    queryset = Product.objects.filter(deleted_at__isnull=True)
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]


class ProductVariantListCreate(generics.ListCreateAPIView):
    queryset = ProductVariant.objects.filter(deleted_at__isnull=True)
    serializer_class = ProductVariantSerializer
    permission_classes = [IsAuthenticated]


class VariantByBarcodeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        code = (request.query_params.get("code") or "").strip()
        if not code:
            return Response({"code": "BARCODE_EMPTY"}, status=400)
        v = (
            ProductVariant.objects.select_related("product", "size", "color")
            .filter(barcode=code, is_active=True, deleted_at__isnull=True)
            .first()
        )
        if not v:
            from core.exceptions import BarcodeNotFound

            return Response(
                {"code": BarcodeNotFound.code, "detail": "Barcode not found"},
                status=404,
            )
        return Response(ProductVariantSerializer(v).data)


class BulkVariantGridView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = BulkGridSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        product = Product.objects.get(pk=ser.validated_data["product_id"])
        created = bulk_create_variant_grid(
            product=product,
            matrix=[dict(c) for c in ser.validated_data["matrix"]],
            user=request.user,
        )
        return Response(
            ProductVariantSerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class ProductDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]
