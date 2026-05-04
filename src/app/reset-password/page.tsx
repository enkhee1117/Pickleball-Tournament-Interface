import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TPMark } from '@/components/ui/TPMark';
import { ResetPasswordForm } from './ResetPasswordForm';

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/forgot-password');
  }

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
          New password,
          <br />
          <span className="italic" style={{ color: 'var(--court)' }}>fresh start.</span>
        </div>
        <div className="mt-3 max-w-[280px] text-[14px] leading-[1.45] opacity-70">
          Setting a new password for{' '}
          <span className="mono" style={{ color: 'var(--court)' }}>{user.email}</span>.
        </div>

        <ResetPasswordForm />
      </div>
    </div>
  );
}
