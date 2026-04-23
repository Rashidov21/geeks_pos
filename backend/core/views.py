import shutil
from datetime import datetime
from pathlib import Path

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner


class BackupNowView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        from django.conf import settings

        db_path = Path(settings.DATABASES["default"]["NAME"])
        if not db_path.exists():
            return Response({"detail": "Database not found"}, status=404)
        out = Path.home() / "Documents" / "GeeksPOS" / "backups"
        out.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = out / f"backup-{stamp}.sqlite3"
        shutil.copy2(db_path, dest)
        return Response({"ok": True, "backup_path": str(dest)})
