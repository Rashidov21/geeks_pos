from django.db import transaction
from django.db.models import F

from catalog.models import ProductVariant

from .models import InventoryMovement


@transaction.atomic
def apply_movement(
    *,
    variant: ProductVariant,
    qty_delta: int,
    movement_type: str,
    user,
    note: str = "",
    ref_sale=None,
) -> InventoryMovement:
    """Adjust stock_qty and append ledger row (same transaction)."""
    if qty_delta == 0:
        raise ValueError("qty_delta cannot be 0")

    if qty_delta < 0:
        updated = ProductVariant.objects.filter(
            pk=variant.pk,
            stock_qty__gte=abs(qty_delta),
        ).update(stock_qty=F("stock_qty") + qty_delta)
        if updated != 1:
            from core.exceptions import InsufficientStock

            raise InsufficientStock("Insufficient stock for movement")
    else:
        ProductVariant.objects.filter(pk=variant.pk).update(
            stock_qty=F("stock_qty") + qty_delta
        )

    variant.refresh_from_db()
    return InventoryMovement.objects.create(
        variant=variant,
        type=movement_type,
        qty_delta=qty_delta,
        ref_sale=ref_sale,
        note=note,
        user=user,
    )
