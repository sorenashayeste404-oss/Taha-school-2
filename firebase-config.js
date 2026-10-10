// Firebase configuration for برنامه ۱۰ مدرسه طاها
// This is a public web config — security is enforced by Firestore rules

export const firebaseConfig = {
  apiKey: "AIzaSyBVp9gGZTSiGi8txUKV7q0i8_VdVU67t68",
  authDomain: "taha-school-224e4.firebaseapp.com",
  projectId: "taha-school-224e4",
  storageBucket: "taha-school-224e4.firebasestorage.app",
  messagingSenderId: "153646669810",
  appId: "1:153646669810:web:f3c85166695627c6ef956b"
};

// رمز ساده ورود مدیر (پروژه دانش‌آموزی)
// این رمز در frontend است؛ برای پروژه واقعی از Firebase Auth استفاده کنید
export const ADMIN_PASSWORD = "taha1234";

export const GROUPS = [
  "دهم تجربی شعبه 1",
  "دهم ریاضی شعبه 1",
  "دهم ریاضی شعبه 2",
  "دهم انسانی شعبه 1",
  "دهم انسانی شعبه 2"
];

export const DAYS = [
  { name: "شنبه", order: 1 },
  { name: "یکشنبه", order: 2 },
  { name: "دوشنبه", order: 3 },
  { name: "سه‌شنبه", order: 4 },
  { name: "چهارشنبه", order: 5 },
  { name: "پنجشنبه", order: 6 }
];

export const DAY_ORDER_MAP = {
  "شنبه": 1,
  "یکشنبه": 2,
  "دوشنبه": 3,
  "سه‌شنبه": 4,
  "چهارشنبه": 5,
  "پنجشنبه": 6
};
