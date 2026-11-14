import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth-forms';

export const metadata: Metadata = {
  title: 'إنشاء متجر جديد',
  robots: { index: false, follow: false, noarchive: true },
};

export default function RegisterPage() { return <RegisterForm />; }
