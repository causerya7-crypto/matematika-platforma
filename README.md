# Test sayti

## Ishga tushirish
1. Node.js o'rnating (nodejs.org).
2. Shu papkada: `node server.js`
3. Brauzerda oching: http://localhost:3000

Boshqa kutubxona kerak emas. Ma'lumotlar `data.json` va `uploads/` papkasida saqlanadi.

## Foydalanuvchi
- Ism va parol yozib "Ro'yxatdan o'tish", keyin "Kirish".
- Test boshlanganda har savol alohida sahifada chiqadi. Tepada savol raqamlari bor (yashil — to'g'ri, qizil — noto'g'ri, kulrang — javobsiz), ularga bosib istalgan savolga o'tish mumkin.
- 1–35: A/B/C/D ga bosilishi bilan javob darrov tekshiriladi.
- 36–45: a va b javoblarini yozib "Tekshirish" bosiladi, har biri alohida to'g'ri/noto'g'ri deb ko'rsatiladi.
- Javob berilgach, savol tagida "Yechim videosi" chiqadi. Javob berilgan savolni qayta o'zgartirib bo'lmaydi.
- "Yakunlash" bosilganda umumiy ball chiqadi (variantli savol — 1 ball, ochiq savolda a va b har biri 1 ball).
- Sahifa yangilansa yoki chiqib ketilsa, javoblar shu brauzerda saqlanib turadi.

## Admin (sayt egasi)
Ism `serik`, parol `serik` bilan kiring.
- Test nomini yozib yangi test qo'shing.
- Har savol uchun raqam (1–45) va rasm yuklang. 1–35 uchun to'g'ri variantni, 36–45 uchun ikkita to'g'ri javobni (a va b) kiriting.
- Savol saqlangach, uning kartasida "Yechim videosi" qismi chiqadi: video fayl yuklang (mp4, webm; 300 MB gacha) yoki havola qo'ying (YouTube va boshqalar).
- "Barcha natijalar" da hamma foydalanuvchining ballari ko'rinadi.

## Xavfsizlik eslatmasi
Internetga chiqarishdan oldin `server.js` boshidagi `ADMIN_NAME` va `ADMIN_PASS` ni o'zgartiring.
