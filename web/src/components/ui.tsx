import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { humanizeApiError } from '@/lib/format';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return <div className="loading-grid" aria-label="جارٍ تحميل البيانات" aria-busy="true">{Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} />)}</div>;
}

export function ErrorPanel({ error, retry }: { error: unknown; retry?: () => void }) {
  const code = error instanceof ApiError ? error.code : 'request_failed';
  const message = error instanceof ApiError ? humanizeApiError(code, error.message) : 'تعذّر تحميل البيانات. تحقق من اتصالك وحاول مرة أخرى.';
  return (
    <div className="inline-error" role="alert">
      <span><AlertCircle size={17} aria-hidden="true" /> {message}</span>
      {retry && <button className="button button-secondary button-sm" type="button" onClick={retry}><RefreshCw size={14} aria-hidden="true" /> إعادة المحاولة</button>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state-icon">{icon}</span>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function PlanRequired({ feature = 'هذه الميزة' }: { feature?: string }) {
  return (
    <div className="inline-alert" role="note">
      <AlertCircle aria-hidden="true" />
      <span>{feature} غير متاحة في خطتك الحالية. راجع <a href="/pricing">الباقات والحدود</a>، أو تواصل معنا لمعرفة خيارات التجديد.</span>
    </div>
  );
}
