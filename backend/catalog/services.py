from decimal import Decimal
from typing import Any

from django.db import transaction

from inventory.models import InventoryMovement
from inventory.services import apply_movement
from .models import Product, ProductVariant


@transaction.atomic
def bulk_create_variant_grid(
    product: Product,
    matrix: list[dict[str, Any]],
    user,
) -> list[ProductVariant]:
    """
    matrix items: size_id, color_id, purchase_price, list_price, initial_qty (int)
    """
    created: list[ProductVariant] = []
    for cell in matrix:
        qty = int(cell.get("initial_qty") or 0)
        v = ProductVariant(
            product=product,
            size_id=cell["size_id"],
            color_id=cell["color_id"],
            purchase_price=Decimal(str(cell["purchase_price"])),
            list_price=Decimal(str(cell["list_price"])),
            stock_qty=0,
        )
        v.save()
        if qty > 0:
            apply_movement(
                variant=v,
                qty_delta=qty,
                movement_type=InventoryMovement.Type.IN,
                user=user,
                note="Initial stock from grid",
            )
        created.append(v)
    return created
