# Test sayti

## Ishga tushirish
1. Node.js o'rnating (nodejs.org).
2. Shu papkada: `node server.js`
3. Brauzerda oching: http://localhost:3000

Boshqa kutubxona kerak emas. Ma'lumotlar `data.json` va `uploads/` papkasida saqlanadi.

## Foydalanish
- Foydalanuvchi: ism va parol yozib "Ro'yxatdan o'tish", keyin "Kirish".
- Admin (sayt egasi): ism `serik`, parol `serik` bilan kiriladi.
  - Test nomini yozib yangi test qo'shadi.
  - Har bir savol uchun raqam (1–45), rasm yuklaydi.
  - 1–35: to'g'ri variantni (A/B/C/D) tanlaydi.
  - 36–45: ikkita to'g'ri javob (a va b) yoziladi.
- Foydalanuvchi testni yechib "Yakunlash" bosadi va ballini ko'radi (variantli savol — 1 ball, ochiq savolda a va b har biri 1 ball).

## Xavfsizlik eslatmasi
Internetga chiqarishdan oldin `server.js` boshidagi `ADMIN_NAME` va `ADMIN_PASS` ni o'zgartiring — `serik/serik` oson topiladi.
