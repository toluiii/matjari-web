'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { FeatureGuard } from '@/components/feature-guard';
import { ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { humanizeApiError } from '@/lib/format';
import { useSession } from '@/components/workspace-shell';

export default function SettingsPage() {
  const client = useQueryClient();
  const session = useSession();
  const query = useQuery({ queryKey: ['store-settings'], queryFn: api.storeSettings });
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [addressOverride, setAddressOverride] = useState<string | null>(null);
  const name = nameOverride ?? query.data?.name ?? '';
  const address = addressOverride ?? query.data?.address ?? '';
  const [storeError, setStoreError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const saveStore = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error('أدخل اسم المتجر.');
      return api.updateStoreSettings({ name: name.trim(), address: address.trim() });
    },
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['store-settings'] }), client.invalidateQueries({ queryKey: ['session'] })]); setNameOverride(null); setAddressOverride(null); setStoreError(''); toast.success('تم حفظ إعدادات المتجر.'); },
    onError: (reason) => setStoreError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر حفظ الإعدادات.'),
  });
  const changePassword = useMutation({
    mutationFn: () => {
      if (!currentPassword) throw new Error('أدخل كلمة المرور الحالية.');
      if (newPassword.length < 12 || newPassword.length > 128) throw new Error('كلمة المرور الجديدة يجب أن تتكوّن من 12 إلى 128 حرفًا.');
      if (newPassword !== confirmPassword) throw new Error('كلمتا المرور الجديدتان غير متطابقتين.');
      if (newPassword === currentPassword) throw new Error('اختر كلمة مرور مختلفة عن الحالية.');
      return api.changePassword({ current_password: currentPassword, new_password: newPassword });
    },
    onSuccess: async () => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); await client.invalidateQueries({ queryKey: ['session'] }); toast.success('تم تغيير كلمة المرور. أُبطلت الجلسات الأخرى.'); },
    onError: (reason) => setPasswordError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر تغيير كلمة المرور.'),
  });

  function submitStore(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setStoreError(''); saveStore.mutate(); }
  function submitPassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPasswordError(''); changePassword.mutate(); }

  return <FeatureGuard feature="settings" title="إعدادات المتجر">
    <PageHeader title="إعدادات المتجر" description="حدّث بيانات المتجر وأمّن حساب صاحب المؤسسة." />
    <div className="settings-grid">
      <section className="card card-padding">
        <div className="card-heading"><div><h2>بيانات المتجر النشط</h2><p>تظهر هذه البيانات في مساحة العمل.</p></div><Building2 size={18} color="#445b7a" /></div>
        {query.isError && <ErrorPanel error={query.error} retry={() => void query.refetch()} />}
        {query.isLoading ? <LoadingRows rows={2} /> : query.data && <>
          <form className="settings-form" onSubmit={submitStore} noValidate><div className="field"><label htmlFor="settings-store-name">اسم المتجر</label><input className="field-control" id="settings-store-name" maxLength={160} value={name} onChange={(event) => setNameOverride(event.target.value)} required /></div><div className="field"><label htmlFor="settings-store-address">العنوان</label><input className="field-control" id="settings-store-address" maxLength={500} value={address} onChange={(event) => setAddressOverride(event.target.value)} /></div><div className="store-code settings-code"><span>رمز المتجر لدخول الموظفين</span><strong dir="ltr">{query.data.code}</strong></div>{storeError && <div className="form-error" role="alert">{storeError}</div>}<button className="button button-primary" type="submit" disabled={saveStore.isPending || (name.trim() === query.data.name && address.trim() === query.data.address)}><Save size={15} aria-hidden="true" /> {saveStore.isPending ? 'جارٍ الحفظ…' : 'حفظ بيانات المتجر'}</button></form>
        </>}
      </section>
      <section className="card card-padding">
        <div className="card-heading"><div><h2>تغيير كلمة المرور</h2><p>يُنهي هذا الإجراء الجلسات الأخرى لصاحب الحساب.</p></div><KeyRound size={18} color="#445b7a" /></div>
        <form className="settings-form" onSubmit={submitPassword} noValidate><div className="field"><label htmlFor="current-password">كلمة المرور الحالية</label><input className="field-control" id="current-password" type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div><div className="field"><label htmlFor="new-password">كلمة المرور الجديدة</label><input className="field-control" id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><span className="field-hint">استخدم 12 حرفًا أو أكثر، وتجنب كلمة استعملتها في خدمة أخرى.</span></div><div className="field"><label htmlFor="confirm-new-password">تأكيد كلمة المرور الجديدة</label><input className="field-control" id="confirm-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>{passwordError && <div className="form-error" role="alert">{passwordError}</div>}<button className="button button-secondary" type="submit" disabled={changePassword.isPending}>{changePassword.isPending ? 'جارٍ التغيير…' : 'تغيير كلمة المرور'}</button></form>
        <div className="security-note"><ShieldCheck aria-hidden="true" /><span>لن نطلب منك كلمة المرور أو رمز دخول الموظف عبر الهاتف. احفظ بيانات الدخول في مكان آمن.</span></div>
      </section>
    </div>
    <div className="page-note">المتصل حاليًا: {session.user.name} · {session.user.phone}. يتطلب تغيير كلمة المرور التحقق من كلمة المرور الحالية.</div>
  </FeatureGuard>;
}
