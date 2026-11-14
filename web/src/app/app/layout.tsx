import type { Metadata } from 'next';
import { WorkspaceShell } from '@/components/workspace-shell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = {
  title: 'مساحة المتجر',
  description: 'مساحة خاصة لإدارة متجرك.',
  robots: { index: false, follow: false, noarchive: true },
};

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
