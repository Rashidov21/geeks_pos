import uuid

from django.conf import settings
from django.db import models


class InventoryMovement(models.Model):
    class Type(models.TextChoices):
        IN = "IN", "In"
        SALE = "SALE", "Sale"
        OUT = "OUT", "Out"
        RETURN = "RETURN", "Return"
        ADJUST = "ADJUST", "Adjust"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        "catalog.ProductVariant",
        on_delete=models.PROTECT,
        related_name="movements",
    )
    type = models.CharField(max_length=16, choices=Type.choices)
    qty_delta = models.IntegerField()
    ref_sale = models.ForeignKey(
        "sales.Sale",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="inventory_movements",
    )
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["variant", "created_at"]),
        ]
