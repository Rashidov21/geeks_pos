# import os
# import sys
# import django

# # 1. Loyihaning asosiy papkasini (root) aniqlash
# # Fayl test papkasida turgani uchun uning ota (parent) papkasini qo'shamiz
# current_dir = os.path.dirname(os.path.abspath(__file__))
# root_dir = os.path.dirname(current_dir) # Bir pog'ona tepaga chiqish
# sys.path.append(root_dir)

# # 2. Endi Django sozlamalarini ko'rsatish
# # 'config.settings' bu yerda config - papka nomi, settings - fayl nomi
# os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
# django.setup()

# from catalog.models import ProductVariant
# from django.db import transaction

# def migrate_to_simple_barcodes():
#     print("--- Shtrix-kodlarni optimallashtirish boshlandi ---")
    
#     # 20 dan boshlanuvchi 8 xonali son (masalan: 20000001)
#     prefix = 20
#     counter = 1
    
#     variants = ProductVariant.objects.all().order_by('id')
#     total = variants.count()
    
#     if total == 0:
#         print("Migratsiya uchun tovarlar topilmadi.")
#         return

#     try:
#         with transaction.atomic():
#             for variant in variants:
#                 # Yangi kodni generatsiya qilish: 20 + 00000 + 1 = 20000001
#                 new_barcode = f"{prefix}{str(counter).zfill(6)}"
                
#                 old_barcode = variant.barcode
#                 variant.barcode = new_barcode
#                 variant.save()
                
#                 print(f"ID: {variant.id} | [{old_barcode}]  ==>  [{new_barcode}]")
#                 counter += 1
                
#         print(f"\n--- Muvaffaqiyatli! {total} ta mahsulot yangilandi ---")
#         print("Endi skaneringiz ushbu kodlarni juda oson taniydi.")

#     except Exception as e:
#         print(f"Xatolik yuz berdi: {e}")

# if __name__ == "__main__":
#     migrate_to_simple_barcodes()


import os
import django
import win32print

# 1. Django muhitini sozlash
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import ProductVariant

# 2. Printer sozlamalari
PRINTER_NAME = "Xprinter XP-365B" # Windows-dagi aniq nomi

def print_labels():
    # Bazadagi barcha variantlarni olish
    variants = ProductVariant.objects.all().order_by('id')[5:10]
    
    if not variants.exists():
        print("Chop etish uchun tovarlar topilmadi.")
        return

    print(f"Jami {variants.count()} ta stiker chop etishga tayyorlanmoqda...")

    try:
        hPrinter = win32print.OpenPrinter(PRINTER_NAME)
        try:
            hJob = win32print.StartDocPrinter(hPrinter, 1, ("BulkLabelPrint", None, "RAW"))
            win32print.StartPagePrinter(hPrinter)

            for variant in variants:
                # Har bir tovar uchun TSPL buyruqlarini shakllantirish
                # Mahsulot nomi va detallari (Krossfit 42 / Kulrang)
                full_name = f"{variant.product.name_ru}"
                details = f"{variant.size.value} / {variant.color.value}"
                price = f"{variant.list_price} UZS"
                barcode = variant.barcode # Yangi raqamli barcode (20000001)

                tspl_command = (
                    f"CLS\r\n"
                    f"SIZE 40 mm, 30 mm\r\n"
                    f"GAP 3 mm, 0 mm\r\n"
                    f"DIRECTION 1\r\n"
                    f"TEXT 40,20,\"3\",0,1,1,\"{full_name}\"\r\n"
                    f"TEXT 40,60,\"2\",0,1,1,\"{details}\"\r\n"
                    f"BARCODE 40,95,\"128\",70,1,0,3,3,\"{barcode}\"\r\n"
                    f"TEXT 40,190,\"3\",0,1,1,\"{price}\"\r\n"
                    f"PRINT 1,1\r\n"
                ).encode('gbk') # 'gbk' yoki 'ascii' printer drayveriga qarab

                win32print.WritePrinter(hPrinter, tspl_command)
                print(f"Yuborildi: {barcode} - {full_name}")

            win32print.EndPagePrinter(hPrinter)
            win32print.EndDocPrinter(hPrinter)
            print("\n--- Barcha stikerlar printer navbatiga yuborildi ---")
            
        finally:
            win32print.ClosePrinter(hPrinter)
    except Exception as e:
        print(f"Xatolik yuz berdi: {e}")

if __name__ == "__main__":
    print_labels()