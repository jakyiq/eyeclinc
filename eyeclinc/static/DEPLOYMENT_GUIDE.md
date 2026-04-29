# دليل النشر — عيادة النور v2
# Access Levels + License System
# ════════════════════════════════════════════════════════

## ما تم بناؤه في هذه الدفعة

| الملف | الوصف |
|-------|-------|
| schema_v2.sql | جداول جديدة: users, sessions, licenses, audit_log + إضافة clinic_id لكل الجداول |
| app.py | النسخة الكاملة مع المصادقة وصلاحيات الأدوار وفحص الترخيص |
| auth.js | طبقة المصادقة في الواجهة — يُضاف كأول سكريبت في index.html |
| requirements.txt | يضيف مكتبة bcrypt |

---

## خطوات التطبيق (اتبعها بالترتيب)

### 1. تحديث Supabase — مرة واحدة فقط

1. افتح لوحة تحكم Supabase → SQL Editor
2. انسخ محتوى **schema_v2.sql** بالكامل والصقه
3. اضغط RUN
4. تحقق من عدم وجود أخطاء (تجاهل التحذيرات "already exists")

**مهم:** بعد تشغيل schema_v2.sql يجب تغيير مفتاح Supabase إلى service_role key:
- Supabase Dashboard → Settings → API → Service Role Key (secret)
- هذا المفتاح يتجاوز RLS — لا تضعه أبداً في الكود الأمامي
- ضعه في .env كـ SUPABASE_KEY

---

### 2. تحديث .env

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...  ← service_role key (وليس anon key)
ANTHROPIC_API_KEY=sk-ant-...
```

---

### 3. تحديث requirements.txt

استبدل ملف requirements.txt بالملف الجديد المرفق.
ثم محلياً:
```bash
pip install -r requirements.txt
```

على Vercel: سيتم التثبيت تلقائياً عند النشر.

---

### 4. استبدال app.py

انسخ app.py الجديد إلى مجلد مشروعك.

---

### 5. إضافة auth.js إلى index.html

في ملف index.html ابحث عن:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/..."></script>
```

أضف قبله مباشرة:
```html
<script src="/static/auth.js"></script>
```

ثم انسخ ملف auth.js إلى مجلد static/

**هيكل المجلدات النهائي:**
```
your-project/
├── app.py              ← الجديد
├── requirements.txt    ← الجديد
├── start.py            ← بدون تغيير
├── vercel.json         ← بدون تغيير
├── schema_v2.sql       ← شُغِّل في Supabase مرة واحدة
└── static/
    ├── index.html      ← أضف سطر auth.js فقط
    └── auth.js         ← الجديد
```

---

### 6. تغيير كلمة مرور المدير الافتراضية

بعد تشغيل التطبيق:
1. ادخل بـ username: **admin** / password: **admin1234**
2. اذهب إلى صفحة "إدارة المستخدمين"
3. غيّر كلمة المرور فوراً

---

### 7. النشر على Vercel

```bash
vercel --prod
```

أو ادفع إلى GitHub وسيتم النشر تلقائياً.

لا تنسَ إضافة متغيرات البيئة في Vercel Dashboard:
- SUPABASE_URL
- SUPABASE_KEY  (service_role)
- ANTHROPIC_API_KEY

---

## نظام الصلاحيات

| الصفحة / الإجراء | مدير | طبيب | موظف استقبال |
|-----------------|------|-------|--------------|
| وصفة جديدة | ✅ | ✅ | ✅ (إنشاء فقط) |
| عرض سجل المرضى | ✅ | ✅ | ✅ |
| تعديل / حذف مريض | ✅ | ✅ | ❌ |
| لوحة التحكم | ✅ | ✅ | ✅ |
| المتابعة | ✅ | ✅ | ✅ |
| التقارير المالية | ✅ | ✅ | ❌ |
| مخزون العدسات | ✅ | ✅ | ❌ |
| المديونون | ✅ | ❌ | ❌ |
| الإعدادات | ✅ | ❌ | ❌ |
| إدارة المستخدمين | ✅ | ❌ | ❌ |
| النسخ الاحتياطي | ✅ | ❌ | ❌ |
| تصدير Excel | ✅ | ✅ | ❌ |

---

## نظام الترخيص

### الخطط والأسعار
| الخطة | المدة | السعر |
|-------|-------|-------|
| monthly | 30 يوم | 30,000 د.ع |
| bimonthly | 60 يوم | 75,000 د.ع |
| biannual | 180 يوم | 210,000 د.ع |
| trial | 30 يوم | مجاني |

### فترة السماح (Grace Period)
- 5 أيام بعد انتهاء الاشتراك
- خلالها: يمكن تسجيل الدخول مع تحذير واضح
- بعدها: يُمنع الدخول تماماً حتى التجديد

### كيفية إضافة اشتراك لعميل جديد
1. سجّل دخول بحساب admin
2. اذهب إلى "إدارة المستخدمين"
3. في قسم "إدارة الترخيص" اختر الخطة وأضف رقم الإيصال
4. اضغط "حفظ الاشتراك"

---

## الأمان

### ما تم تأمينه
- ✅ كلمات المرور مشفرة بـ bcrypt (12 rounds)
- ✅ الجلسات تنتهي تلقائياً بعد 8 ساعات
- ✅ مفتاح service_role لا يظهر في الكود الأمامي أبداً
- ✅ كل نقطة API محمية بـ decorator
- ✅ كل استعلام DB يفلتر بـ clinic_id (عزل البيانات)
- ✅ سجل audit لكل الإجراءات الحساسة
- ✅ RLS في Supabase يمنع الوصول المباشر

### تحذيرات
- ⚠️ لا تضع service_role key في index.html أو أي كود أمامي
- ⚠️ غيّر كلمة مرور admin فور التثبيت
- ⚠️ استخدم HTTPS دائماً في الإنتاج (Vercel يوفرها تلقائياً)

---

## استكشاف الأخطاء

### خطأ "Insert failed — check Supabase RLS"
← تأكد أنك تستخدم service_role key وليس anon key

### خطأ "unauthenticated" عند كل طلب
← تأكد أن auth.js مضاف قبل أي script آخر في index.html

### المستخدم الافتراضي لا يعمل
← تأكد من تشغيل schema_v2.sql — يجب أن يحتوي على سطر INSERT INTO users

### bcrypt error عند التثبيت على Windows
```bash
pip install bcrypt --upgrade
```

---

## الخطوات القادمة (الدفعة التالية)

1. **نظام الإشعارات Push** (Web Push API + service worker)
2. **حماية Vercel** (middleware token أو Vercel Edge Config)
3. **تلميع التصميم** (شاشة تسجيل دخول احترافية + لمسات بصرية)
4. **نظام الفواتير** (PDF بشعار العيادة وختم)
