import uuid

from django.db import models


class IntegrationSettings(models.Model):
    class WhatsAppProvider(models.TextChoices):
        GREEN_API = "GREEN_API", "GreenAPI"
        CUSTOM = "CUSTOM", "Custom API"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    telegram_bot_token = models.CharField(max_length=255, blank=True, default="")
    telegram_chat_id = models.CharField(max_length=128, blank=True, default="")
    whatsapp_api_base = models.CharField(max_length=255, blank=True, default="")
    whatsapp_api_token = models.CharField(max_length=255, blank=True, default="")
    whatsapp_sender = models.CharField(max_length=64, blank=True, default="")
    whatsapp_provider = models.CharField(
        max_length=16, choices=WhatsAppProvider.choices, default=WhatsAppProvider.GREEN_API
    )
    greenapi_instance_id = models.CharField(max_length=64, blank=True, default="")
    greenapi_api_token_instance = models.CharField(max_length=255, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_solo(cls):
        obj = cls.objects.order_by("-updated_at").first()
        if obj:
            return obj
        return cls.objects.create()

