import uuid

from django.db import models


class StoreSettings(models.Model):
    """Singleton-style store metadata for receipt header."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    brand_name = models.CharField(max_length=255, default="Geeks POS")
    phone = models.CharField(max_length=64, blank=True, default="")
    address = models.CharField(max_length=500, blank=True, default="")
    footer_note = models.CharField(max_length=500, blank=True, default="Rahmat!")
    logo = models.ImageField(upload_to="store_logos/", null=True, blank=True)

    # Printer language behavior
    encoding = models.CharField(max_length=32, default="cp866")
    transliterate_uz = models.BooleanField(default=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Store settings"
        verbose_name_plural = "Store settings"

    def __str__(self):
        return self.brand_name

    @classmethod
    def get_solo(cls):
        obj = cls.objects.order_by("updated_at").first()
        if obj:
            return obj
        return cls.objects.create(brand_name="Geeks POS")
