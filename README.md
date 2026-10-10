# برنامه ۱۰ مدرسه طاها

اپلیکیشن وب مدرسه برای دانش‌آموزان پایه دهم — برنامه هفتگی، کارهای روزانه و پیام‌رسان عمومی.

- **بدون نیاز به Node.js / npm / build**
- **قابل اجرا مستقیم روی GitHub Pages**
- **Backend: Firebase Firestore**
- **طراحی Mobile-First و کاملاً Responsive**
- **پیام‌رسان عمومی Real-Time**

---

## فایل‌های پروژه

```
├── index.html          # صفحه اصلی
├── style.css           # استایل‌ها
├── app.js              # منطق برنامه (ES Module)
├── firebase-config.js  # تنظیمات Firebase
├── firestore.rules     # قوانین امنیتی Firestore
├── firebase.json       # تنظیمات Firebase CLI (اختیاری)
├── .gitignore
└── README.md
```

---

## ۱. استقرار روی GitHub Pages

### گام‌ها:

1. یک Repository جدید در GitHub بسازید (مثلاً `taha-school-app`).
2. تمام فایل‌های این پوشه را در ریشه Repository قرار دهید.
3. Repository را **Public** کنید.
4. به مسیر بروید:
   ```
   Settings → Pages
   ```
5. در بخش **Source**:
   - Source: **Deploy from a branch**
   - Branch: **main** (یا master)
   - Folder: **/ (root)**
6. دکمه **Save** را بزنید.
7. بعد از ۱–۲ دقیقه سایت در آدرس زیر در دسترس است:
   ```
   https://YOUR_USERNAME.github.io/REPO_NAME/
   ```

> **نکته:** چون از مسیرهای نسبی (`./style.css` و `./app.js`) استفاده شده، پروژه هم در ریشه و هم در subpath درست کار می‌کند.

---

## ۲. تنظیم Firebase

### الف) ورود مدیر (رمز ساده)

ورود مدیر **بدون ایمیل** و فقط با رمز ثابت انجام می‌شود.

رمز پیش‌فرض:

```
taha1234
```

برای تغییر رمز، فایل `firebase-config.js` را باز کنید و مقدار `ADMIN_PASSWORD` را عوض کنید.

> این روش برای پروژه دانش‌آموزی ساده است. برای پروژه واقعی بهتر است از Firebase Authentication استفاده شود.

### ب) Firestore Database

1. وارد [Firebase Console](https://console.firebase.google.com/) شوید.
2. پروژه **taha-school-224e4** را باز کنید.
3. از منوی سمت چپ: **Build → Firestore Database**
4. اگر دیتابیس نساخته‌اید: **Create database** → حالت **Production mode** → منطقه را انتخاب کنید.
5. بعد از ایجاد، به تب **Rules** بروید.
6. محتوای فایل `firestore.rules` را کپی کرده و جایگزین قوانین فعلی کنید، سپس **Publish** بزنید.

### ج) Collection پیام‌رسان

Collection جدید:

```
messages
```

هر document شامل فیلدهای زیر است:

| فیلد        | نوع      | توضیح                          |
|-------------|----------|--------------------------------|
| text        | string   | متن پیام (حداکثر ۵۰۰ کاراکتر) |
| senderId    | string   | شناسه پایدار کلاینت            |
| senderName  | string   | نام نمایشی فرستنده             |
| createdAt   | timestamp| زمان ارسال (serverTimestamp)   |

نیازی به ساخت دستی Collection نیست؛ با اولین پیام به‌صورت خودکار ایجاد می‌شود.

### د) ایندکس‌ها

برای `messages` مرتب‌سازی روی `createdAt` معمولاً ایندکس تک‌فیلدی خودکار کافی است.

اگر خطای `failed-precondition` دیدید، لینک ساخت ایندکس داخل کنسول مرورگر را باز کنید.

برای lessons و tasks (مثل قبل):

- `lessons`: group ASC, dayOrder ASC, timeOrder ASC
- `tasks`: group ASC, dayOrder ASC

---

## ۳. پیام‌رسان

- یک اتاق چت عمومی مشترک برای همه کاربران
- Real-Time با `onSnapshot`
- آخرین ۸۰ پیام نمایش داده می‌شود
- نام نمایشی در localStorage ذخیره می‌شود
- مدیر پس از ورود می‌تواند با دکمه «برنامه دانش‌آموز» وارد اپ شود و پیام‌ها را حذف کند
- متن پیام‌ها با `textContent` رندر می‌شود (امن در برابر XSS)

---

## ۴. کلاس‌ها

- دهم تجربی شعبه 1
- دهم ریاضی شعبه 1
- دهم ریاضی شعبه 2
- دهم انسانی شعبه 1
- دهم انسانی شعبه 2

---

## نسخه

**۱.۱.۰** — افزودن پیام‌رسان عمومی
