'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpLeft, Eye, EyeOff } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { humanizeApiError } from '@/lib/format';
import { normalizeTunisianPhone, ownerRegistrationSchema } from '@/lib/schemas';
import { Brand } from '@/components/brand';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return humanizeApiError(error.code, error.message);
  return 'تعذّر الاتصال بالخدمة. تحقق من اتصالك ثم أعد المحاولة.';
}

function AuthAside({ register = false }: { register?: boolean }) {
  return (
    <aside className="auth-aside">
      <Brand />
      <div className="auth-aside-copy">
        <span className="eyebrow"><span className="eyebrow-dot" /> مساحة عمل عربية للمتاجر</span>
        <h1>{register ? 'ابدأ بتنظيم يوم متجرك.' : 'أهلًا بعودتك إلى متجرك.'}</h1>
        <p>تابع المنتجات والمخزون والمبيعات من مساحة واحدة، بصلاحيات تناسب صاحب المتجر وفريقه.</p>
        <ul className="auth-aside-list">
          <li><ArrowUpLeft aria-hidden="true" /> أرقامك وبياناتك التشغيلية في مساحة خاصة.</li>
          <li><ArrowUpLeft aria-hidden="true" /> الدينار التونسي وتوقيت تونس في الواجهة.</li>
          <li><ArrowUpLeft aria-hidden="true" /> تحكم واضح في صلاحيات كل موظف.</li>
        </ul>
      </div>
      <p className="auth-aside-foot">متجري — أدوات يومية لإدارة المتجر بوضوح أكبر.</p>
    </aside>
  );
}

function FormTop({ back = '/' }: { back?: string }) {
  return (
    <div className="auth-topline">
      <Brand compact />
      <Link className="auth-back" href={back}><ArrowUpLeft aria-hidden="true" /> الصفحة الرئيسية</Link>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [loginType, setLoginType] = useState<'owner' | 'employee'>('owner');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: api.login,
    onSuccess: () => {
      router.replace('/app');
      router.refresh();
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const normalizedPhone = normalizeTunisianPhone(phone);
    if (!normalizedPhone) {
      setError('أدخل رقم هاتف تونسيًا صحيحًا، مثل 20 123 456.');
      return;
    }
    if (loginType === 'owner') {
      if (password.length < 1 || password.length > 128) {
        setError('أدخل كلمة المرور.');
        return;
      }
      mutation.mutate({ login_type: 'owner', phone: normalizedPhone, password });
      return;
    }
    const normalizedStoreCode = storeCode.trim().toUpperCase();
    const normalizedAccessCode = accessCode
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(normalizedStoreCode)) {
      setError('رمز المتجر يجب أن يتكوّن من 8 أحرف أو أرقام.');
      return;
    }
    if (!/^\d{6}$/.test(normalizedAccessCode)) {
      setError('رمز دخول الموظف يجب أن يتكوّن من 6 أرقام.');
      return;
    }
    mutation.mutate({ login_type: 'employee', phone: normalizedPhone, store_code: normalizedStoreCode, access_code: normalizedAccessCode });
  }

  return (
    <div className="auth-page">
      <AuthAside />
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="login-title">
          <FormTop />
          <h2 id="login-title">تسجيل الدخول</h2>
          <p className="auth-subtitle">أدخل بيانات الدخول للوصول إلى مساحة متجرك.</p>
          <div className="auth-tabs" role="tablist" aria-label="نوع الحساب">
            <button className="auth-tab" type="button" role="tab" aria-selected={loginType === 'owner'} onClick={() => { setLoginType('owner'); setError(''); }}>صاحب المتجر</button>
            <button className="auth-tab" type="button" role="tab" aria-selected={loginType === 'employee'} onClick={() => { setLoginType('employee'); setError(''); }}>موظف</button>
          </div>
          <form className="auth-form" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="login-phone">رقم الهاتف</label>
              <input className="field-control" id="login-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="20 123 456" value={phone} onChange={(event) => setPhone(event.target.value)} required />
              <span className="field-hint">رقم تونسي يبدأ بـ 2 أو 3 أو 4 أو 5 أو 7 أو 9.</span>
            </div>
            {loginType === 'owner' ? (
              <div className="field">
                <label htmlFor="login-password">كلمة المرور</label>
                <div className="input-with-action">
                  <input className="field-control" id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                  <button className="password-toggle" type="button" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="store-code">رمز المتجر</label>
                  <input className="field-control" id="store-code" name="store_code" autoComplete="off" dir="ltr" maxLength={8} placeholder="8 أحرف أو أرقام" value={storeCode} onChange={(event) => setStoreCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8))} required />
                </div>
                <div className="field">
                  <label htmlFor="access-code">رمز دخول الموظف</label>
                  <input className="field-control" id="access-code" name="access_code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} placeholder="••••••" value={accessCode} onChange={(event) => setAccessCode(event.target.value.replace(/[^0-9٠-٩۰-۹]/g, '').slice(0, 6))} required />
                  <span className="field-hint">اطلب الرمز من صاحب المتجر. لا تشاركه مع أي شخص.</span>
                </div>
              </>
            )}
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'جارٍ التحقق…' : 'دخول إلى المتجر'} <ArrowLeft aria-hidden="true" />
            </button>
          </form>
          <div className="auth-divider">أو</div>
          <p className="auth-footnote">ليس لديك حساب صاحب متجر؟ <Link href="/register">أنشئ متجرًا جديدًا</Link></p>
          <p className="auth-footnote">بالمتابعة، أنت توافق على <Link href="/terms">شروط الاستخدام</Link> و<Link href="/privacy">سياسة الخصوصية</Link>.</p>
        </section>
      </main>
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address, setAddress] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: api.register,
    onSuccess: () => {
      router.replace('/app');
      router.refresh();
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const normalizedPhone = normalizeTunisianPhone(phone);
    const input = {
      store_name: storeName,
      owner_name: ownerName,
      phone: normalizedPhone ?? '',
      password,
      address,
      accept_terms: acceptTerms,
    };
    const parsed = ownerRegistrationSchema.safeParse(input);
    if (!normalizedPhone) {
      setError('أدخل رقم هاتف تونسيًا صحيحًا، مثل 20 123 456.');
      return;
    }
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'راجع البيانات المدخلة.');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <div className="auth-page">
      <AuthAside register />
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="register-title">
          <FormTop />
          <h2 id="register-title">إنشاء متجر جديد</h2>
          <p className="auth-subtitle">ابدأ ببيانات صاحب المتجر. يتضمن التسجيل فترة تجريبية لمدة 14 يومًا.</p>
          <form className="auth-form" onSubmit={submit} noValidate>
            <div className="field"><label htmlFor="store-name">اسم المتجر</label><input className="field-control" id="store-name" name="store_name" autoComplete="organization" maxLength={160} value={storeName} onChange={(event) => setStoreName(event.target.value)} required /></div>
            <div className="field"><label htmlFor="owner-name">اسم صاحب المتجر</label><input className="field-control" id="owner-name" name="owner_name" autoComplete="name" maxLength={160} value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required /></div>
            <div className="field"><label htmlFor="register-phone">رقم الهاتف</label><input className="field-control" id="register-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="20 123 456" value={phone} onChange={(event) => setPhone(event.target.value)} required /></div>
            <div className="field-row">
              <div className="field"><label htmlFor="register-password">كلمة المرور</label><div className="input-with-action"><input className="field-control" id="register-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="password-toggle" type="button" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></div>
              <div className="field"><label htmlFor="confirm-password">تأكيد كلمة المرور</label><input className="field-control" id="confirm-password" name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
            </div>
            <div className="field"><label htmlFor="store-address">عنوان المتجر <span className="field-hint">(اختياري)</span></label><input className="field-control" id="store-address" name="address" autoComplete="street-address" maxLength={500} value={address} onChange={(event) => setAddress(event.target.value)} /></div>
            <label className="field-check"><input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} /><span>قرأت <Link href="/terms">شروط الاستخدام</Link> و<Link href="/privacy">سياسة الخصوصية</Link> وأوافق عليهما.</span></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب'} <ArrowLeft aria-hidden="true" /></button>
          </form>
          <p className="auth-footnote">لديك حساب بالفعل؟ <Link href="/login">سجّل الدخول</Link></p>
          <p className="auth-footnote">لا تُدخل بيانات عملاء حقيقية قبل مراجعة <Link href="/privacy">سياسة الخصوصية</Link>.</p>
        </section>
      </main>
    </div>
  );
}
