from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("printing", "0002_hardware_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="storesettings",
            name="lock_timeout_minutes",
            field=models.PositiveSmallIntegerField(default=5),
        ),
    ]

