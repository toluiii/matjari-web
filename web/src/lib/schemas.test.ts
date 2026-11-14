import { describe, expect, it } from 'vitest';
import { normalizeTunisianPhone, ownerRegistrationSchema } from '@/lib/schemas';

describe('Tunisian phone normalization', () => {
  it.each([
    ['20 123 456', '+21620123456'],
    ['+216 99 123 456', '+21699123456'],
    ['216-55-123-456', '+21655123456'],
    ['٧١ ٢٣٤ ٥٦٧', '+21671234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeTunisianPhone(input)).toBe(expected);
  });

  it.each(['12 345 678', '+216 10 000 000', '++216 20 123 456', 'abc', '216 20 123 45'])('rejects invalid phone %s', (input) => {
    expect(normalizeTunisianPhone(input)).toBeNull();
  });
});

describe('owner registration fields', () => {
  it('accepts bounded data with a strong password and explicit terms consent', () => {
    expect(ownerRegistrationSchema.safeParse({
      store_name: 'متجر المدينة',
      owner_name: 'أحمد',
      phone: '+21620123456',
      password: 'a-secure-long-password',
      address: '',
      accept_terms: true,
    }).success).toBe(true);
  });

  it('requires explicit consent and a minimum password length', () => {
    expect(ownerRegistrationSchema.safeParse({
      store_name: 'متجر المدينة',
      owner_name: 'أحمد',
      phone: '+21620123456',
      password: 'short',
      address: '',
      accept_terms: false,
    }).success).toBe(false);
  });
});
