from rest_framework import serializers

from .models import IntegrationSettings


class IntegrationSettingsSerializer(serializers.ModelSerializer):
    @staticmethod
    def _mask_secret(value: str) -> str:
        raw = (value or "").strip()
        if not raw:
            return ""
        if len(raw) <= 4:
            return "*" * len(raw)
        return f"{'*' * (len(raw) - 4)}{raw[-4:]}"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for key in ["telegram_bot_token", "whatsapp_api_token", "greenapi_api_token_instance"]:
            data[key] = self._mask_secret(data.get(key, ""))
        return data

    def update(self, instance, validated_data):
        # Ignore masked placeholders coming back from frontend.
        for key in ["telegram_bot_token", "whatsapp_api_token", "greenapi_api_token_instance"]:
            value = validated_data.get(key)
            if isinstance(value, str) and "*" in value:
                validated_data.pop(key, None)
        return super().update(instance, validated_data)

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

