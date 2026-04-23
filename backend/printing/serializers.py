from rest_framework import serializers

from .models import StoreSettings


class StoreSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StoreSettings
        fields = [
            "id",
            "brand_name",
            "phone",
            "address",
            "footer_note",
            "logo",
            "logo_url",
            "encoding",
            "transliterate_uz",
            "updated_at",
        ]
        read_only_fields = ["id", "logo_url", "updated_at"]

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.logo.url)
        return obj.logo.url
