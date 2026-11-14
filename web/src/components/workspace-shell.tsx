'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Boxes,
  BriefcaseBusiness,
  ChevronLeft,
  CircleDollarSign,
  FileChartColumnIncreasing,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Settings2,
  ShoppingBag,
  Store,
  Truck,
  UsersRound,
  X,
} from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { formatDate, planLabel, remainingDays } from '@/lib/format';
import type { Feature, Session } from '@/lib/types';
import { Brand } from '@/components/brand';

const SessionContext = createContext<Session | null>(null);
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside WorkspaceShell');
  return session;
}

const navItems: { href: string; label: string; icon: typeof LayoutDashboard; feature?: Feature }[] = [
  { href: '/app', label: 'لوحة التحكم', icon: LayoutDashboard },
  { href: '/app/products', label: 'المنتجات', icon: Package, feature: 'products' },
  { href: '/app/stock', label: 'المخزون', icon: Boxes, feature: 'stock' },
  { href: '/app/sales', label: 'المبيعات', icon: ShoppingBag, feature: 'sales' },
  { href: '/app/orders', label: 'الطلبات', icon: Truck, feature: 'orders' },
  { href: '/app/debts', label: 'ديون العملاء', icon: ReceiptText, feature: 'debts' },
  { href: '/app/employees', label: 'الموظفون', icon: UsersRound, feature: 'employees' },
  { href: '/app/stores', label: 'المتاجر', icon: Store, feature: 'multi_store' },
  { href: '/app/financials', label: 'التقارير المالية', icon: FileChartColumnIncreasing, feature: 'financials' },
  { href: '/app/billing', label: 'الخطة والتجديد', icon: CircleDollarSign, feature: 'billing' },
  { href: '/app/settings', label: 'إعدادات المتجر', icon: Settings2, feature: 'settings' },
];

function LoadingWorkspace() {
  return (
    <div className="access-loading">
      <div className="access-loading-card"><Brand /><p>جارٍ التحقق من جلسة متجرك…</p><div className="skeleton" style={{ marginTop: 22 }} /></div>
    </div>
  );
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.session, retry: false, staleTime: 20_000 });
  const session = sessionQuery.data;

  useEffect(() => {
    const onUnauthorized = () => router.replace('/login?expired=1');
    window.addEventListener('matjari:unauthorized', onUnauthorized);
    return () => window.removeEventListener('matjari:unauthorized', onUnauthorized);
  }, [router]);

  useEffect(() => {
    if (sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401) {
      router.replace('/login?expired=1');
    }
  }, [router, sessionQuery.error]);

  const visibleItems = useMemo(
    () => navItems.filter((item) => !item.feature || session?.permissions[item.feature]),
    [session],
  );

  if (!session) {
    if (sessionQuery.error && !(sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401)) {
      return (
        <div className="access-loading"><div className="access-loading-card"><Brand /><p>تعذّر الاتصال بمساحة العمل.</p><button className="button button-secondary" type="button" onClick={() => void sessionQuery.refetch()}>إعادة المحاولة</button></div></div>
      );
    }
    return <LoadingWorkspace />;
  }

  async function logout() {
    try {
      await api.logout();
      await sessionQuery.refetch();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        toast.error('تعذّر تسجيل الخروج الآن. حاول مرة أخرى.');
        return;
      }
    }
    router.replace('/login');
    router.refresh();
  }

  const daysLeft = remainingDays(session.subscription.expires_at);

  return (
    <SessionContext.Provider value={session}>
      <div className="workspace">
        <button className="access-shade" data-open={sidebarOpen} type="button" aria-label="إغلاق القائمة" onClick={() => setSidebarOpen(false)} />
        <aside className="sidebar" data-open={sidebarOpen} aria-label="القائمة الجانبية">
          <div className="sidebar-brand"><Brand compact /></div>
          <div className="sidebar-store"><small>مساحة العمل</small><strong>{session.store.name}</strong><div className="plan-row"><span>الخطة {planLabel(session.subscription.plan)}</span><b>{daysLeft} يوم متبقٍ</b></div></div>
          <nav className="sidebar-nav" aria-label="التنقل داخل المتجر">
            <div className="sidebar-label">القائمة الرئيسية</div>
            {visibleItems.map(({ href, label, icon: Icon }) => {
              const current = href === '/app' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
              return <Link className="nav-link" href={href} key={href} aria-current={current ? 'page' : undefined} onClick={() => setSidebarOpen(false)}><Icon aria-hidden="true" /><span>{label}</span>{current && <ChevronLeft size={14} aria-hidden="true" />}</Link>;
            })}
          </nav>
          <div className="sidebar-footer"><div className="sidebar-profile"><span className="avatar" aria-hidden="true">{session.user.name.trim().slice(0, 1) || 'م'}</span><span className="sidebar-profile-text"><strong>{session.user.name}</strong><small>{session.user.role === 'owner' ? 'صاحب المتجر' : 'موظف'}</small></span><button className="sidebar-logout" type="button" title="تسجيل الخروج" aria-label="تسجيل الخروج" onClick={() => void logout()}><LogOut aria-hidden="true" /></button></div></div>
        </aside>
        <div className="workspace-main">
          <header className="workspace-topbar">
            <div className="topbar-left">
              <button className="mobile-sidebar-toggle" type="button" aria-label={sidebarOpen ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}>{sidebarOpen ? <X size={18} /> : <Menu size={18} />}</button>
              <div className="topbar-greeting"><small>إدارة المتجر</small><strong>{session.organization.name}</strong></div>
            </div>
            <div className="topbar-actions">
              {session.subscription.active ? <span className="topbar-store"><BriefcaseBusiness aria-hidden="true" /> {session.store.name}</span> : <Link className="button button-primary button-sm" href="/app/billing">الخطة منتهية <ChevronLeft size={15} aria-hidden="true" /></Link>}
            </div>
          </header>
          <main className="workspace-content">
            {!session.subscription.active && <div className="inline-alert"><CircleDollarSign aria-hidden="true" /><span>انتهت صلاحية الخطة. قد تكون بعض عمليات التعديل متوقفة. <Link href="/app/billing">أرسل طلب تجديد</Link>. تاريخ الانتهاء: {formatDate(session.subscription.expires_at)}.</span></div>}
            {children}
          </main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
