import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import type { ResolvedIdentifier } from './identifier';

// Shared account-creation policy for /signup and the mixer cold-join quick
// account. One place encodes it so the two forms can't drift:
//   - Email path: the account is created with the user's real email so
//     password reset / future magic links reach an actual inbox.
//   - Phone path: paired with a synthetic email (`<digits>@phone.local`)
//     so signInWithPassword can route through the email provider — this
//     sidesteps the project's "Phone provider" toggle.
//   - Either way the address is auto-confirmed so signup is one step (no
//     click through a verification email) — the mixer usage pattern is
//     "guests show up and want to play in under a minute."
//
// Callers decide what "already exists" means: /signup treats it as an error
// (`existed: true`), cold-join falls through to signInWithPassword so a
// returning player can re-join with their existing password.

export type CreateAccountResult = {
  user: User | null;
  existed: boolean;
  error: string | null;
};

export async function createConfirmedAccount({
  resolved,
  password,
  displayName,
}: {
  resolved: ResolvedIdentifier;
  password: string;
  displayName: string;
}): Promise<CreateAccountResult> {
  const admin = createAdminClient();
  const createPayload =
    resolved.kind === 'phone'
      ? {
          phone: resolved.phone,
          email: resolved.email, // synth email so signInWithPassword works
          password,
          phone_confirm: true,
          email_confirm: true,
          user_metadata: { display_name: displayName },
        }
      : {
          email: resolved.email,
          password,
          email_confirm: true,
          user_metadata: { display_name: displayName },
        };
  const { data: created, error: createErr } = await admin.auth.admin.createUser(createPayload);
  if (createErr) {
    const msg = createErr.message?.toLowerCase() ?? '';
    const existed = msg.includes('already') || msg.includes('exists') || msg.includes('registered');
    if (existed) return { user: null, existed: true, error: null };
    return { user: null, existed: false, error: createErr.message };
  }
  return { user: created.user ?? null, existed: false, error: null };
}
