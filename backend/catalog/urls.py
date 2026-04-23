from django.urls import path

from . import views

urlpatterns = [
    path("categories/", views.CategoryListCreate.as_view()),
    path("sizes/", views.SizeListCreate.as_view()),
    path("colors/", views.ColorListCreate.as_view()),
    path("products/", views.ProductListCreate.as_view()),
    path("products/<uuid:pk>/", views.ProductDetail.as_view()),
    path("variants/", views.ProductVariantListCreate.as_view()),
    path("variants/<uuid:pk>/", views.ProductVariantDetail.as_view()),
    path("variants/by-barcode/", views.VariantByBarcodeView.as_view()),
    path("variants/bulk-grid/", views.BulkVariantGridView.as_view()),
]
