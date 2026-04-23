"""Backend-generated barcodes: PRD-{first 8 hex of variant UUID}."""


def default_barcode_from_variant_id(variant_id) -> str:
    hex_id = str(variant_id).replace("-", "")
    short = hex_id[:8].upper()
    return f"PRD-{short}"


def allocate_unique_barcode(variant, max_attempts: int = 50) -> str:
    """
    Assign barcode to variant. Collision (manual barcode) -> append -2, -3, ...
    """
    from catalog.models import ProductVariant

    base = default_barcode_from_variant_id(variant.id)
    candidate = base
    for n in range(max_attempts):
        exists = (
            ProductVariant.objects.exclude(pk=variant.pk)
            .filter(barcode=candidate)
            .exists()
        )
        if not exists:
            return candidate
        suffix = f"-{n + 2}" if n else "-2"
        candidate = base + suffix
    raise RuntimeError("Could not allocate unique barcode")
