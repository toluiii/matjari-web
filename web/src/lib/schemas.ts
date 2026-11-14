import { z } from 'zod';

export function normalizeTunisianPhone(input: string): string | null {
  const value = input
    .trim()
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  const compact = value.replace(/[\s()-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const digits = compact.startsWith('+') ? compact.slice(1) : compact;
  const national = digits.length === 8 ? digits : digits.startsWith('216') && digits.length === 11 ? digits.slice(3) : '';
  if (!/^[234579]\d{7}$/.test(national)) return null;
  return `+216${national}`;
}

export const ownerRegistrationSchema = z.object({
  store_name: z.string().trim().min(1, 'أدخل اسم المتجر.').max(160, 'اسم المتجر طويل جدًا.'),
  owner_name: z.string().trim().min(1, 'أدخل اسم صاحب المتجر.').max(160, 'الاسم طويل جدًا.'),
  phone: z.string().min(1, 'أدخل رقم الهاتف.'),
  password: z.string().min(12, 'كلمة المرور يجب أن تتكوّن من 12 حرفًا على الأقل.').max(128, 'كلمة المرور طويلة جدًا.'),
  address: z.string().max(500, 'العنوان طويل جدًا.'),
  accept_terms: z.literal(true, { error: 'يجب الموافقة على الشروط للمتابعة.' }),
});
