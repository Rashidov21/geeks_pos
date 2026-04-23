📄 Project Brief: Geeks POS
1. Project Identity
Project Name: Geeks POS

Industry: Fashion Retail (Shoes & Clothing)

Lead Developer: Abdurahmon Rashidov

Contact: +998 93 911 31 23

Developer Organization: Geeks Andijan (geeksandijan.uz)

Status: Professional Development Phase

2. General Concept
Geeks POS — bu kiyim-kechak va oyoq kiyim do'konlari uchun mo'ljallangan, offline-first tamoyili asosida ishlaydigan zamonaviy savdo va inventarizatsiya tizimi. Tizim do'kon ichida internet uzilgan holatda ham 100% funksionallikni saqlab qolishi va internet ulanganda ma'lumotlarni bulutli server (Cloud) bilan sinxronizatsiya qilishi shart.

3. Core Technical Requirements
Cursor AI, ushbu loyihani amalga oshirishda quyidagi texnik cheklovlarga qat'iy amal qilishing kerak:

Architecture: Hybrid Desktop App.

Backend: Django (Python) — Biznes mantiq va API uchun.

Local Database: SQLite (Offline ishlash uchun).

Frontend: React + Tailwind CSS (Interfeys uchun).

Wrapper: Tauri (Veb-ilovani desktop dasturga aylantirish va hardware bilan ishlash uchun).

Data Integrity: Barcha jadvallarda (Models) uuid asosiy kalit sifatida ishlatilsin. Har bir o'zgarish updated_at va is_synced flagi orqali nazorat qilinishi shart.

Localization: Tizim to'liq ikki tilda (Uzbek, Russian) bo'ladi. react-i18next va model darajasidagi tarjimalar qo'llanilsin.

4. Key Functional Features (The "What I Want")
Smart Inventory (Size Grid): Mahsulot qo'shishda faqat bitta forma emas, balki ranglar va o'lchamlar matritsasi (Grid) bo'lishi kerak. Bir vaqtning o'zida 10 ta o'lchamga miqdor kiritish imkoniyati.

Fast POS Interface: Kassir shtrix-kodni skaner qilganda mahsulot 1 soniyadan kam vaqtda savatchaga tushishi va keyingi skanerga tayyor turishi kerak.

Debt Management: Nasiya savdolarni ism va telefon raqam orqali qayd etish, qisman to'lovlarni qabul qilish, qarz/nasiya to'lov muddatlarini belgilash, eski nasiyalarni birinchida ko'rsatish va qarzdorlik tarixini yuritish.

Hardware Integration: ESC/POS termal printerlariga chek chiqarish va shtrix-kod skanerlari bilan ishlash.

Analytics: Kunlik foyda, eng ko'p sotilgan tovarlar va ombor qoldig'i bo'yicha Telegram bot orqali bildirishnomalar.

5. Coding Standards for AI
Clean Code: Mantiqiy qismlarni services.py ga ajrat, views.py faqat so'rovlarni qabul qilsin.

DRY (Don't Repeat Yourself): Kodni qayta ishlatiladigan komponentlarga bo'l.

Security: Local ma'lumotlar xavfsizligini ta'minla, foydalanuvchi rollarini (Admin/Kassir) to'g'ri ajrat.