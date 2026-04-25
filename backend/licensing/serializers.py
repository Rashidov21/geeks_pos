from rest_framework import serializers


class LicenseActivateSerializer(serializers.Serializer):
    hardware_id = serializers.CharField(max_length=128, required=True, allow_blank=False)
    license_key = serializers.CharField(max_length=255, required=True, allow_blank=False)
