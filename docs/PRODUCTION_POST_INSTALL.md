# Geeks POS — production build & post-install

## One-shot production build (Windows)

From repo root (PowerShell):

```powershell
.\scripts\build-production.ps1
```

Optional:

- `-SkipNpmInstall` — if `frontend/node_modules` is already fresh.
- `-SkipClean` — incremental (not recommended for release).
- `-SkipRustTargetOnClean` with full clean via `.\scripts\clean-build-artifacts.ps1 -SkipRustTarget` — faster clean, then run build-production with `-SkipClean` if you manage clean yourself.

Artifacts:

- **Installers**: `src-tauri/target/release/bundle/` (MSI / NSIS / etc. per `tauri.conf.json` `bundle.targets`).
- **Sidecar**: built to `backend/dist/geeks_pos_backend.exe` plus `geeks_pos_backend-<host-triple>.exe` for Tauri `externalBin`; copies also under `src-tauri/bin/` for convenience.

## Backend sidecar (PyInstaller)

Script: `backend/scripts/build_sidecar.ps1`

- **`--noconsole`**: no extra console window for the packaged API.
- **`--collect-all escpos`**: full `python-escpos` (`escpos` import name) including `capabilities.json`.
- **DEBUG**: Tauri release spawns sidecar with `DJANGO_DEBUG=0`. Packaged `run_waitress.py` also defaults `DJANGO_DEBUG=0` when `sys.frozen`.

## Bundle identifier

`tauri.conf.json` uses `uz.geeks.pos`. Agar ilgari `com.geeks.pos` bilan MSI chiqarilgan bo‘lsa, Windows yangi mahsulot sifatida ko‘rishi mumkin — yangilash strategiyasini shunga moslang.

## Tauri / UI defaults

- **Window**: default **1366×768**, resizable, not fullscreen, not always-on-top.
- **Kiosk** (fullscreen, always-on-top, non-resizable): set environment variable `GEEKS_POS_KIOSK=1` for the desktop shortcut or process (e.g. monoblok lock-down).

## Data directory & SQLite

On first run the app creates a writable tree (see `backend/config/settings.py` and `src-tauri/src/main.rs`):

1. `%APPDATA%\GeeksPOS` (preferred)
2. then `%LOCALAPPDATA%\GeeksPOS`
3. then `%USERPROFILE%\GeeksPOS`

Database file: **`%APPDATA%\GeeksPOS\db.sqlite3`** (when `APPDATA` is set). Logs: `%APPDATA%\GeeksPOS\logs\`.

**Installer must not** ship `backend/db.sqlite3` from the repo; the build scripts fail if it exists.

## Firewall (manual / post-install)

Tauri’s default WiX/NSIS flow does **not** add a firewall rule. After install, run **elevated** once:

```powershell
.\scripts\windows\add-firewall-rule.ps1
```

Or pass the sidecar path explicitly:

```powershell
.\scripts\windows\add-firewall-rule.ps1 -ProgramPath "C:\Program Files\GEEKS POS\geeks_pos_backend-x86_64-pc-windows-msvc.exe"
```

The backend only listens on **127.0.0.1**; a rule is mainly for strict corporate policies or future localhost edge cases.

---

## Post-install checklist (monoblok)

1. **Install** the MSI or setup from `src-tauri/target/release/bundle/`.
2. **WebView2**: ensure [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) is installed (first launch checks this).
3. **First launch**: confirm `%APPDATA%\GeeksPOS\` exists and `db.sqlite3` is created after migrations.
4. **License**: set `LICENSE_API_BASE_URL`, `LICENSE_AUTH_TOKEN`, `LICENSE_CLIENT_API_KEY` in deployment docs / env as applicable (see backend `.env` examples).
5. **Printers**: configure receipt/label printers in Settings; test print from admin.
6. **Firewall** (optional): run `scripts/windows/add-firewall-rule.ps1` as Administrator.
7. **Kiosk vs windowed**: use default windowed 1366×768, or set `GEEKS_POS_KIOSK=1` on the shortcut for fullscreen kiosk.
8. **Backup**: schedule or document `python scripts/backup_sqlite.py` for `%APPDATA%\GeeksPOS\db.sqlite3`.
