import Link from 'next/link';
import { TPMark } from '@/components/ui/TPMark';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <div
      className="relative flex min-h-[100dvh] flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--ink)', color: 'var(--paper)' }}
    >
      <div className="px-[22px] pt-7">
        <TPMark size={36} color="var(--paper)" accent="var(--court)" />
      </div>

      <div className="relative flex flex-1 flex-col justify-end p-[22px]">
        <div className="serif text-[42px] leading-[1.0] tracking-[-0.02em]">
          Forgot it
          <br />
          <span className="italic" style={{ color: 'var(--court)' }}>happens.</span>
        </div>
        <div className="mt-3 max-w-[280px] text-[14px] leading-[1.45] opacity-70">
          Enter your email and we&rsquo;ll send a reset link.
        </div>

        <ForgotPasswordForm />

        <p className="mt-3.5 text-center text-[12px] opacity-60">
          Remembered it?{' '}
          <Link href="/login" className="font-semibold" style={{ color: 'var(--court)' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
