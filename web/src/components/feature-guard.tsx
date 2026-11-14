'use client';

import type { ReactNode } from 'react';
import { useSession } from '@/components/workspace-shell';
import type { Feature } from '@/lib/types';
import { PageHeader, PlanRequired } from '@/components/ui';

export function FeatureGuard({ feature, title, children }: { feature: Feature; title: string; children: ReactNode }) {
  const session = useSession();
  if (!session.permissions[feature]) {
    return (
      <>
        <PageHeader title={title} description="الوصول إلى هذا القسم محدود بحسب دور الحساب والخطة." />
        {session.user.role === 'owner'
          ? <PlanRequired feature={title}
            />
          : <div className="inline-alert" role="note">ليس لديك صلاحية لعرض هذا القسم. اطلب من صاحب المتجر تعديل صلاحيات حسابك.</div>}
      </>
    );
  }
  return children;
}
