import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth-forms';

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  robots: { index: false, follow: false, noarchive: true },
};

export default function LoginPage() { return <LoginForm />; }
