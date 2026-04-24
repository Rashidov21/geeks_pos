from django.urls import path

from . import views

urlpatterns = [
    path("categories/", views.CategoryListCreate.as_view()),
    path("categories/<uuid:pk>/", views.CategoryDetail.as_view()),
    path("sizes/", views.SizeListCreate.as_view()),
    path("sizes/<uuid:pk>/", views.SizeDetail.as_view()),
    path("colors/", views.ColorListCreate.as_view()),
    path("colors/<uuid:pk>/", views.ColorDetail.as_view()),
    path("products/", views.ProductListCreate.as_view()),
    path("products/<uuid:pk>/", views.ProductDetail.as_view()),
    path("variants/", views.ProductVariantListCreate.as_view()),
    path("variants/<uuid:pk>/", views.ProductVariantDetail.as_view()),
    path("variants/<uuid:pk>/pos-price/", views.PosVariantPriceView.as_view()),
    path("variants/by-barcode/", views.VariantByBarcodeView.as_view()),
    path("variants/pos-search/", views.PosVariantSearchView.as_view()),
    path("variants/pos-by-product/", views.PosVariantByProductView.as_view()),
    path("variants/bulk-grid/", views.BulkVariantGridView.as_view()),
]
