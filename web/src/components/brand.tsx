import Link from 'next/link';
import { Store } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="متجري، الصفحة الرئيسية">
      <span className="brand-mark" aria-hidden="true"><Store /></span>
      <span className="brand-copy">
        <strong>متجري</strong>
        {!compact && <small>إدارة المتجر بوضوح</small>}
      </span>
    </Link>
  );
}
