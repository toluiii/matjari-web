import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Arabic public site', () => {
  test('home page has a localized, crawlable product introduction', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar-TN');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('كل تفاصيل متجرك');
    await expect(page).toHaveTitle(/متجري/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /برنامج إدارة متجر/);
    await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('link', { name: 'الباقات' })).toHaveAttribute('href', '/pricing');
    await expect(page.getByText('معاينة توضيحية — لا تعرض بيانات متجر حقيقية')).toBeVisible();
  });

  test('plan details are honest about limits and manual renewal', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('اختر مساحة');
    await expect(page.getByText('لا تُعرض أسعار ثابتة هنا')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'المتوسطة' })).toBeVisible();
    await expect(page.getByText('حتى 15 موظفًا')).toBeVisible();
    await expect(page.getByText('لا تُدخل بيانات بطاقة')).toBeVisible();
  });

  test('registration validates Tunisian contact details before making a request', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/**', async (route) => {
      apiCalled = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'api_unavailable' } }) });
    });
    await page.goto('/register');
    await page.getByLabel('اسم المتجر').fill('متجر التجربة');
    await page.getByLabel('اسم صاحب المتجر').fill('أحمد');
    await page.getByLabel('رقم الهاتف').fill('11111111');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('a-long-secure-password');
    await page.getByLabel('تأكيد كلمة المرور').fill('a-long-secure-password');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
    await expect(page.locator('.form-error')).toContainText('رقم هاتف تونسيًا صحيحًا');
    expect(apiCalled).toBe(false);
  });

  test('private workspace redirects an unauthenticated session to sign-in', async ({ page }) => {
    await page.route('**/api/auth/session', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Authentication required' } }),
    }));
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  });

  test('mobile workspace sidebar closes after navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const session = {
      user: { id: 'user-test', name: 'أحمد', phone: '+21620123456', role: 'owner' },
      store: { id: 'store-test', name: 'متجر الاختبار', code: 'ABCD2345' },
      organization: { id: 'org-test', name: 'متجر الاختبار' },
      subscription: {
        plan: 'trial', expires_at: '2027-01-01T00:00:00Z', active: true,
        max_products: 250, max_employees: 0, max_stores: 1,
      },
      permissions: {
        products: true, stock: true, sales: true, orders: true, debts: true,
        employees: true, multi_store: true, financials: true, billing: true, settings: true,
      },
    };
    await page.route('**/api/auth/session', (route) => route.fulfill({ json: session }));
    await page.route('**/api/products**', (route) => route.fulfill({
      json: { data: [], total: 0, page: 1, page_size: 20 },
    }));
    await page.route('**/api/sales**', (route) => route.fulfill({
      json: { data: [], total: 0, page: 1, page_size: 20 },
    }));

    await page.goto('/app/products');
    await expect(page.getByRole('heading', { level: 1, name: 'المنتجات' })).toBeVisible();
    const openButton = page.getByRole('button', { name: 'فتح القائمة' });
    await expect(openButton).toBeVisible();
    await openButton.click();
    const sidebar = page.getByRole('complementary', { name: 'القائمة الجانبية' });
    await expect(sidebar).toHaveAttribute('data-open', 'true');
    await sidebar.getByRole('link', { name: 'المبيعات' }).click();
    await expect(page).toHaveURL(/\/app\/sales$/);
    await expect(page.getByRole('heading', { level: 1, name: 'المبيعات' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'فتح القائمة' })).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toHaveAttribute('data-open', 'false');
  });

  test('home page has no critical WCAG 2.1 A/AA issues', async ({ page }) => {
    await page.goto('/');
    const axePage = page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'];
    const result = await new AxeBuilder({ page: axePage }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations, JSON.stringify(result.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length })))).toEqual([]);
  });
});
