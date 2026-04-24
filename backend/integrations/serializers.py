from rest_framework import serializers

from .models import IntegrationSettings


class IntegrationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationSettings
        fields = [
            "telegram_bot_token",
            "telegram_chat_id",
            "whatsapp_api_base",
            "whatsapp_api_token",
            "whatsapp_sender",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

