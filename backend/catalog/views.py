from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q
from django.utils import timezone

from core.permissions import IsAdminOrOwner, IsCashier

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
    permission_classes = [IsAuthenticated, IsAdminOrOwner]


class SizeListCreate(generics.ListCreateAPIView):
    queryset = Size.objects.all()
    serializer_class = SizeSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]


class ColorListCreate(generics.ListCreateAPIView):
    queryset = Color.objects.all()
    serializer_class = ColorSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]


class ProductListCreate(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    class CatalogPagination(PageNumberPagination):
        page_size = 20
        page_size_query_param = "page_size"
        max_page_size = 200

    pagination_class = CatalogPagination

    def get_queryset(self):
        include_deleted = self.request.query_params.get("include_deleted") == "1"
        query = (self.request.query_params.get("q") or "").strip()
        qs = Product.objects.all()
        if not include_deleted:
            qs = qs.filter(deleted_at__isnull=True)
        if query:
            qs = qs.filter(Q(name_uz__icontains=query) | Q(name_ru__icontains=query))
        return qs.order_by("name_uz")


class ProductVariantListCreate(generics.ListCreateAPIView):
    serializer_class = ProductVariantSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    class CatalogPagination(PageNumberPagination):
        page_size = 20
        page_size_query_param = "page_size"
        max_page_size = 200

    pagination_class = CatalogPagination

    def get_queryset(self):
        include_deleted = self.request.query_params.get("include_deleted") == "1"
        query = (self.request.query_params.get("q") or "").strip()
        qs = ProductVariant.objects.select_related("product", "size", "color")
        if not include_deleted:
            qs = qs.filter(deleted_at__isnull=True)
        if query:
            qs = qs.filter(
                Q(barcode__icontains=query)
                | Q(product__name_uz__icontains=query)
                | Q(size__label_uz__icontains=query)
                | Q(color__label_uz__icontains=query)
            )
        return qs.order_by("product__name_uz", "barcode")


class VariantByBarcodeView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

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
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

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
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at"])


class ProductVariantDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ProductVariant.objects.select_related("product", "size", "color")
    serializer_class = ProductVariantSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at"])
