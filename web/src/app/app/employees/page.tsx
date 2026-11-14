'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Pencil, Plus, Search, ShieldCheck, UserRound, UserRoundCheck, UserRoundX } from 'lucide-react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/dialog';
import { FeatureGuard } from '@/components/feature-guard';
import { EmptyState, ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { dinarsFromMilliemes, formatMoney, formatNumber, humanizeApiError, parseTnd } from '@/lib/format';
import { normalizeTunisianPhone } from '@/lib/schemas';
import type { Employee } from '@/lib/types';

type EmployeePermissions = Record<'products' | 'stock' | 'sales' | 'orders' | 'debts', boolean>;
const permissionLabels: { key: keyof EmployeePermissions; label: string }[] = [
  { key: 'products', label: 'المنتجات' },
  { key: 'stock', label: 'المخزون' },
  { key: 'sales', label: 'المبيعات' },
  { key: 'orders', label: 'الطلبات' },
  { key: 'debts', label: 'الديون (إن كانت بالخطة)' },
];
const defaultPermissions: EmployeePermissions = { products: true, stock: true, sales: true, orders: true, debts: false };

function EmployeeFormDialog({ open, employee, onClose }: { open: boolean; employee: Employee | null; onClose: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState(employee?.name ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [wage, setWage] = useState(employee ? dinarsFromMilliemes(employee.daily_wage_milliemes) : '0.000');
  const [permissions, setPermissions] = useState<EmployeePermissions>({ ...defaultPermissions, ...(employee?.permissions ?? {}) });
  const [error, setError] = useState('');
  const [oneTimeCode, setOneTimeCode] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('أدخل اسم الموظف.');
      const wageValue = parseTnd(wage);
      if (wageValue === null || wageValue < 0 || wageValue > 1_000_000_000) throw new Error('أدخل مبلغًا صحيحًا للأجر اليومي.');
      if (employee) return api.updateEmployee(employee.id, { name: name.trim(), daily_wage_milliemes: wageValue, permissions, active: employee.active });
      const normalizedPhone = normalizeTunisianPhone(phone);
      if (!normalizedPhone) throw new Error('أدخل رقم هاتف تونسيًا صحيحًا.');
      return api.createEmployee({ name: name.trim(), phone: normalizedPhone, daily_wage_milliemes: wageValue, permissions });
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['employees'] });
      if ('access_code' in result) {
        setOneTimeCode(result.access_code);
        toast.success('تم إنشاء حساب الموظف. احتفظ برمز الدخول لمرة واحدة.');
      } else {
        toast.success('تم تحديث بيانات الموظف.');
        onClose();
      }
    },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر حفظ بيانات الموظف.'),
  });

  async function copyCode() {
    try { await navigator.clipboard.writeText(oneTimeCode); toast.success('تم نسخ الرمز.'); }
    catch { toast.error('تعذّر النسخ. دوّن الرمز يدويًا قبل إغلاق هذه النافذة.'); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); mutation.mutate(); }

  return <FormDialog open={open} onOpenChange={(value) => !value && onClose()} title={oneTimeCode ? 'رمز دخول الموظف' : employee ? 'تعديل بيانات الموظف' : 'إضافة موظف'} description={oneTimeCode ? 'يظهر هذا الرمز مرة واحدة فقط. شاركه مع الموظف بطريقة آمنة.' : 'حدد الحساب والصلاحيات التي يحتاجها الموظف لعمله.'}>
    {oneTimeCode ? <div className="code-reveal"><div className="access-code-card"><small>رمز دخول مؤقت — 6 أرقام</small><strong>{oneTimeCode}</strong><p>أغلق النافذة بعد تدوين الرمز؛ لن يظهر مجددًا. عند نسيانه، يمكنك تدويره من صفحة الموظفين.</p></div><div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => void copyCode()}><Copy size={15} /> نسخ الرمز</button><button className="button button-primary" type="button" onClick={onClose}>تم، إغلاق</button></div></div> : <form className="dialog-form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="employee-name">اسم الموظف</label><input className="field-control" id="employee-name" maxLength={160} value={name} onChange={(event) => setName(event.target.value)} required /></div>
      {employee ? <div className="field"><label>رقم الهاتف</label><div className="field-control employee-phone" dir="ltr">{employee.phone}</div><span className="field-hint">لا يمكن تغيير رقم الهاتف من هذه الشاشة.</span></div> : <div className="field"><label htmlFor="employee-phone">رقم الهاتف</label><input className="field-control" id="employee-phone" type="tel" dir="ltr" maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} required /></div>}
      <div className="field"><label htmlFor="employee-wage">الأجر اليومي (د.ت) <span className="field-hint">(اختياري، لأغراض المتابعة)</span></label><input className="field-control" id="employee-wage" inputMode="decimal" dir="ltr" value={wage} onChange={(event) => setWage(event.target.value)} /></div>
      <fieldset className="field permission-fieldset"><legend className="field-label">صلاحيات الوصول</legend><div className="checkbox-grid">{permissionLabels.map(({ key, label }) => <label className="checkbox-option" key={key}><input type="checkbox" checked={permissions[key]} onChange={(event) => setPermissions((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div></fieldset>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'جارٍ الحفظ…' : employee ? 'حفظ التغييرات' : 'إنشاء حساب الموظف'}</button></div>
    </form>}
  </FormDialog>;
}

function RotateCodeDialog({ value, onClose }: { value: { name: string; code: string } | null; onClose: () => void }) {
  async function copyCode() { try { await navigator.clipboard.writeText(value?.code ?? ''); toast.success('تم نسخ الرمز.'); } catch { toast.error('تعذّر النسخ. دوّن الرمز قبل الإغلاق.'); } }
  return <FormDialog open={Boolean(value)} onOpenChange={(open) => !open && onClose()} title="رمز دخول جديد" description="تم إبطال الرمز السابق. شارك الرمز الجديد مع الموظف بأمان.">
    {value && <div className="code-reveal"><div className="access-code-card"><small>رمز مؤقت لـ {value.name}</small><strong>{value.code}</strong><p>يظهر الآن فقط. لا ترسله في مكان عام.</p></div><div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => void copyCode()}><Copy size={15} /> نسخ الرمز</button><button className="button button-primary" type="button" onClick={onClose}>إغلاق</button></div></div>}
  </FormDialog>;
}

export default function EmployeesPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [codeValue, setCodeValue] = useState<{ name: string; code: string } | null>(null);
  const query = useQuery({ queryKey: ['employees', page, search], queryFn: () => api.employees({ page, page_size: 20, search }) });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; daily_wage_milliemes: number; permissions: EmployeePermissions; active: boolean } }) => api.updateEmployee(id, body),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['employees'] }); toast.success('تم تحديث حالة الموظف.'); },
    onError: (reason) => toast.error(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : 'تعذّر تحديث الموظف.'),
  });
  const rotateMutation = useMutation({
    mutationFn: api.rotateEmployeeCode,
    onSuccess: async (result, employee) => { await client.invalidateQueries({ queryKey: ['employees'] }); const person = query.data?.data.find((item) => item.id === employee); setCodeValue({ name: person?.name ?? 'الموظف', code: result.access_code }); },
    onError: (reason) => toast.error(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : 'تعذّر تدوير الرمز.'),
  });

  function openCreate() { setSelected(null); setDialogOpen(true); }
  function openEdit(employee: Employee) { setSelected(employee); setDialogOpen(true); }
  return <FeatureGuard feature="employees" title="الموظفون">
    <PageHeader title="الموظفون" description="أدر حسابات الفريق وصلاحيات الدخول إلى أقسام المتجر." actions={<button className="button button-primary button-sm" type="button" onClick={openCreate}><Plus size={15} aria-hidden="true" /> إضافة موظف</button>} />
    <div className="inline-alert"><ShieldCheck aria-hidden="true" /><span>يظهر رمز الدخول عند الإنشاء أو التدوير مرة واحدة فقط. لا تحفظه في ملاحظة عامة ولا تشارك كلمة مرور صاحب المتجر.</span></div>
    <section className="card toolbar"><div className="toolbar-group"><label className="search-control"><Search aria-hidden="true" /><input aria-label="البحث عن موظف" type="search" placeholder="ابحث بالاسم أو رقم الهاتف…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label></div><span className="toolbar-count">{query.data ? `${formatNumber(query.data.total)} موظف` : 'فريق المتجر'}</span></section>
    <section className="card">
      {query.isError && <div style={{ padding: 16 }}><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div>}
      {query.isLoading ? <div style={{ padding: 17 }}><LoadingRows /></div> : query.data?.data.length ? <>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>الموظف</th><th>الصلاحيات</th><th>الأجر اليومي</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{query.data.data.map((employee: Employee) => <tr key={employee.id}><td><span className="table-primary">{employee.name}</span><span className="table-secondary" dir="ltr">{employee.phone}</span></td><td><span className="employee-permissions">{permissionLabels.filter(({ key }) => employee.permissions?.[key]).map(({ label }) => label.replace(/ \(.*\)/, '')).join('، ') || 'لا توجد صلاحيات'}</span></td><td>{formatMoney(employee.daily_wage_milliemes)}</td><td><span className={`badge ${employee.active ? 'badge-success' : 'badge-danger'}`}>{employee.active ? 'نشط' : 'متوقف'}</span></td><td><div className="table-actions"><button className="icon-button" type="button" title="تعديل الموظف" aria-label={`تعديل ${employee.name}`} onClick={() => openEdit(employee)}><Pencil aria-hidden="true" /></button><button className="icon-button" type="button" title={employee.active ? 'إيقاف الحساب' : 'تفعيل الحساب'} aria-label={employee.active ? `إيقاف ${employee.name}` : `تفعيل ${employee.name}`} disabled={updateMutation.isPending} onClick={() => { const nextActive = !employee.active; if (!nextActive && !window.confirm(`إيقاف حساب ${employee.name}؟ ستُسجّل خروجه من الجلسات الحالية.`)) return; updateMutation.mutate({ id: employee.id, body: { name: employee.name, daily_wage_milliemes: employee.daily_wage_milliemes, permissions: { ...defaultPermissions, ...employee.permissions }, active: nextActive } }); }}>{employee.active ? <UserRoundX aria-hidden="true" /> : <UserRoundCheck aria-hidden="true" />}</button>{employee.active && <button className="icon-button" type="button" title="تدوير رمز الدخول" aria-label={`تدوير رمز ${employee.name}`} disabled={rotateMutation.isPending} onClick={() => rotateMutation.mutate(employee.id)}><KeyRound aria-hidden="true" /></button>}</div></td></tr>)}</tbody></table></div>
        <div className="pagination"><span>عرض {formatNumber((page - 1) * 20 + 1)}–{formatNumber(Math.min(page * 20, query.data.total))} من {formatNumber(query.data.total)}</span><div className="pagination-actions"><button type="button" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span className="pagination-current">{formatNumber(page)}</span><button type="button" aria-label="الصفحة التالية" disabled={page * 20 >= query.data.total} onClick={() => setPage((value) => value + 1)}>›</button></div></div>
      </> : !query.isError ? <EmptyState icon={<UserRound aria-hidden="true" />} title="لا يوجد موظفون مضافون" description="أنشئ حسابًا لكل موظف بدل مشاركة حساب صاحب المتجر." action={<button className="button button-primary button-sm" type="button" onClick={openCreate}><Plus size={15} /> إضافة أول موظف</button>} /> : null}
    </section>
    <div className="page-note">الأجر اليومي حقل متابعة داخل النظام، وليس مسير أجور أو تقريرًا محاسبيًا.</div>
    <EmployeeFormDialog key={`${dialogOpen}-${selected?.id ?? 'new'}`} open={dialogOpen} employee={selected} onClose={() => setDialogOpen(false)} />
    <RotateCodeDialog value={codeValue} onClose={() => setCodeValue(null)} />
  </FeatureGuard>;
}
