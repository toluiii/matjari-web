const TND = new Intl.NumberFormat('ar-TN', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const DATE = new Intl.DateTimeFormat('ar-TN', {
  dateStyle: 'medium',
  timeZone: 'Africa/Tunis',
});
const DATETIME = new Intl.DateTimeFormat('ar-TN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

/** Format integer milliemes for display only; monetary calculations stay in integer milliemes. */
export function formatMoney(milliemes: number | null | undefined): string {
  if (milliemes == null || !Number.isFinite(milliemes)) return '—';
  return `${TND.format(milliemes / 1000)} د.ت`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATETIME.format(date);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ar-TN', { maximumFractionDigits: 0 }).format(value);
}

/** Convert a user-entered dinar amount to integer milliemes without floating-point arithmetic. */
export function parseTnd(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٫,]/g, '.')
    .replace(/\s+/g, '');
  const match = /^(\d{1,10})(?:\.(\d{0,3}))?$/.exec(normalized);
  if (!match) return null;
  const fractional = (match[2] ?? '').padEnd(3, '0');
  const whole = Number(match[1]);
  const fraction = Number(fractional);
  const total = whole * 1000 + fraction;
  return Number.isSafeInteger(total) ? total : null;
}

export function dinarsFromMilliemes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  const whole = Math.floor(value / 1000);
  const fraction = String(Math.abs(value % 1000)).padStart(3, '0');
  return `${whole}.${fraction}`;
}

export function todayInTunis(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Africa/Tunis',
  }).format(new Date());
}

export function remainingDays(expiresAt: string): number {
  const expiry = new Date(expiresAt).getTime();
  return Math.max(0, Math.ceil((expiry - Date.now()) / 86_400_000));
}

export function planLabel(plan: string): string {
  const labels: Record<string, string> = {
    trial: 'تجريبية',
    basic: 'أساسية',
    medium: 'متوسطة',
    premium: 'مميزة',
  };
  return labels[plan] ?? plan;
}

export function paymentLabel(payment: string): string {
  const labels: Record<string, string> = {
    cash: 'نقدًا',
    card: 'بطاقة',
    transfer: 'تحويل',
  };
  return labels[payment] ?? payment;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'جديد',
    confirmed: 'مؤكّد',
    preparing: 'قيد التحضير',
    ready: 'جاهز للتسليم',
    delivered: 'تمّ التسليم',
    cancelled: 'ملغى',
  };
  return labels[status] ?? status;
}

export function humanizeApiError(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'انتهت جلسة الدخول. سجّل الدخول من جديد.',
    forbidden: 'ليست لديك صلاحية لهذا الإجراء.',
    not_found: 'لم نعثر على السجل المطلوب.',
    conflict: 'يوجد سجلّ آخر بهذه البيانات.',
    plan_required: 'هذه الميزة غير متاحة في خطتك الحالية.',
    insufficient_stock: 'الكمية المتوفرة في المخزون غير كافية.',
    invalid_transition: 'لا يمكن نقل الطلب إلى هذه الحالة الآن.',
    idempotency_conflict: 'تعذّر تأكيد العملية بأمان. حدّث الصفحة وحاول مجددًا.',
    rate_limited: 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.',
    validation_error: 'راجع البيانات المدخلة وتأكد من صحتها.',
    internal_error: 'حدث خطأ مؤقت. لم نتمكن من إكمال الطلب.',
  };
  return messages[code] ?? fallback;
}
