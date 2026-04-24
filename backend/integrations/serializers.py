from rest_framework import serializers

from .models import IntegrationSettings


class IntegrationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationSettings
        fields = [
            "telegram_bot_token",
            "telegram_chat_id",
            "whatsapp_provider",
            "whatsapp_api_base",
            "whatsapp_api_token",
            "whatsapp_sender",
            "greenapi_instance_id",
            "greenapi_api_token_instance",
            "primary_report_channel",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

