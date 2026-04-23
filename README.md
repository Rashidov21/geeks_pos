# 🛒 Geeks POS — Fashion Retail Management System

**Geeks POS** — kiyim-kechak va oyoq kiyim do'konlari uchun maxsus ishlab chiqilgan, zamonaviy, tezkor va **Offline-first** tamoyilida ishlovchi savdo tizimi. Loyiha **Geeks Andijan** o'quv markazi hamjamiyati tomonidan ishlab chiqilmoqda.

---

## 👨‍💻 Muallif va Jamoa
- **Lead Developer:** Abdurahmon Rashidov  
- **Organization:** [Geeks Andijan](https://geeks.uz)  
- **Contact:** +998 (93) 911-31-23  
- **Status:** Active Development (v1.0.0-alpha)

---

## 🎯 Loyiha Maqsadi
Kichik va o'rta biznes (Fashion Retail) uchun internet aloqasiga bog'lanib qolmagan, omborni o'lchamlar (size) va ranglar (color) bo'yicha aniq nazorat qiluvchi, nasiya savdolarni hisobga oluvchi qulay POS terminal yaratish.

## 🚀 Texnologik Stek
- **Frontend:** React.js, Tailwind CSS, Vite
- **Backend:** Django (Python), Django REST Framework
- **Desktop Wrapper:** Tauri (Rust based)
- **Database:** SQLite (Local), PostgreSQL (Cloud)
- **State Management:** Zustand (MVP: server-side SQLite only; IndexedDB yo‘q)
- **Integrations:** Telegram Bot API, ESC/POS Printing, Barcode Scanning

---

## ✨ Asosiy Imkoniyatlar
- **Offline-first Architecture:** Internet yo'qligida to'liq ishlash va keyinchalik Cloud bilan sinxronizatsiya.
- **Smart Matrix Inventory:** Kiyim va poyabzallar uchun o'lcham va ranglar panjarasi (Size Grid) orqali tovar qo'shish.
- **Fast Checkout:** Shtrix-kod skaneri yordamida 1 soniyadan kam vaqt ichida savdoni yakunlash.
- **Debt Tracking:** Mijozlar kesimida nasiya va qarzdorlik hisobi (Nasiya nazorati).
- **Multi-language:** O'zbek va Rus tillarida to'liq interfeys.
- **Reporting:** Kunlik savdo, foyda va ombor qoldig'i bo'yicha Telegram bildirishnomalari.

---

## 📂 Loyiha Strukturasi
```text
geeks_pos/
├── backend/            # Django project (Business Logic & API)
├── frontend/           # React + Vite (UI/UX)
├── src-tauri/          # Tauri configuration (Desktop setup)
├── docs/               # Technical documentation & Database schemas
└── shared/             # Assets & Constant configurations
```

## Ishga tushirish (MVP kod bazasi)

### 1) Backend (Django + SQLite + Waitress)

```powershell
cd backend
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python run_waitress.py
```

- API: `http://127.0.0.1:8000/api/health/`
- Demo login: `cashier` / `pass12345` (`seed_demo` yaratadi)

### 2) Frontend (Vite + React + Tailwind + Zustand)

Alohida terminal:

```powershell
cd frontend
npm install
npm run dev
```

Brauzer: `http://localhost:5173` — so‘rovlar `/api` orqali Vite proxy orqali Django ga boradi (session/CSRF uchun qulay).

### 3) Ikkala servis (root)

```powershell
npm install
npm run dev
```

### 4) Tauri (Rust o‘rnatilgan bo‘lsa)

```powershell
npm run tauri:dev
```

`src-tauri` ichida `print_plain` (Windows: `notepad /p` orqali matn chek) va `print_escpos` (raw `.bin` faylga yozish) buyruqlari mavjud.

### Testlar va backup

```powershell
cd backend
python -m pytest tests/ -q
```

```powershell
python scripts/backup_sqlite.py
```

Batafsil: [docs/BACKUP_AND_MIGRATION.md](docs/BACKUP_AND_MIGRATION.md)

### Phase 3 — oddiy cloud push

```powershell
set CLOUD_PUSH_URL=https://example.com/ingest/
cd backend
python manage.py push_sales
```

yoki autentifikatsiyadan keyin `POST /api/sync/push-sales/`.