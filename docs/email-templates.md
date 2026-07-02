# Supabase Email Templates — Try to Dink

Paste these into **Supabase → Authentication → Email Templates**. Each one both
brands the email and — critically — points the confirmation link at our
`/auth/confirm` route in the `token_hash` + `type` format that route expects.

## Why the link format matters
Supabase's default templates use `{{ .ConfirmationURL }}`, which routes through
Supabase's hosted `/auth/v1/verify` endpoint and redirects back with a `?code=`
param our route doesn't handle → the user lands on `/login?error=Invalid link`.

Our [`src/app/auth/confirm/route.ts`](../src/app/auth/confirm/route.ts) instead
expects `token_hash` + `type` and calls `verifyOtp`. So every template's link
must be:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<TYPE>&next=<PATH>
```

| Template | `type=` | `next=` |
|---|---|---|
| Reset Password | `recovery` | `/reset-password` |
| Confirm Signup | `signup` | `/` |
| Magic Link | `magiclink` | `/` |
| Invite User | `invite` | `/` |
| Change Email | `email_change` | `/` |

`{{ .SiteURL }}` resolves to the Site URL in Auth → URL Configuration
(`https://trytodink.com`). Keep that correct.

## Shared brand palette (email-safe hex)
- Paper `#F8F6F1` · Card `#ffffff` · Line `#D9D4C7`
- Ink `#27241D` · Secondary `#534F45` · Muted `#857F73`
- Court green `#9CD96B` · Court deep `#5C8A3B` · Button text `#1a2e0f`
- Headlines use Georgia (Instrument Serif can't be relied on in email clients).

---

## Reset Password

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #D9D4C7;border-radius:18px;">
      <tr><td style="padding:28px 32px 4px;">
        <span style="font-family:Georgia,serif;font-size:22px;color:#27241D;">Try to <span style="color:#5C8A3B;font-style:italic;">Dink</span></span>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.15;color:#27241D;margin:0 0 12px;">Reset your password</h1>
        <p style="font-size:15px;line-height:1.55;color:#534F45;margin:0 0 24px;">Tap the button to choose a new password. This link expires in 60 minutes and can be used once.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px;">
        <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password"
           style="display:inline-block;background:#9CD96B;color:#1a2e0f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:14px;">Reset password &rarr;</a>
      </td></tr>
      <tr><td style="padding:20px 32px 28px;">
        <p style="font-size:12px;line-height:1.5;color:#857F73;margin:0;">Didn't request this? Ignore this email — your password won't change.</p>
      </td></tr>
    </table>
    <p style="font-size:11px;color:#857F73;margin:16px 0 0;">Try to Dink · trytodink.com</p>
  </td></tr>
</table>
```
Subject: `Reset your Try to Dink password`

---

## Confirm Signup
(Only used if you turn OFF auto-confirm for email signups. Currently signups
are auto-confirmed, so this is dormant — but keep it branded for when you flip it.)

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #D9D4C7;border-radius:18px;">
      <tr><td style="padding:28px 32px 4px;">
        <span style="font-family:Georgia,serif;font-size:22px;color:#27241D;">Try to <span style="color:#5C8A3B;font-style:italic;">Dink</span></span>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.15;color:#27241D;margin:0 0 12px;">Confirm your email</h1>
        <p style="font-size:15px;line-height:1.55;color:#534F45;margin:0 0 24px;">One tap and you're in — confirm your email to start running mixers and tournaments.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px;">
        <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/"
           style="display:inline-block;background:#9CD96B;color:#1a2e0f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:14px;">Confirm email &rarr;</a>
      </td></tr>
      <tr><td style="padding:20px 32px 28px;">
        <p style="font-size:12px;line-height:1.5;color:#857F73;margin:0;">Didn't create an account? You can ignore this email.</p>
      </td></tr>
    </table>
    <p style="font-size:11px;color:#857F73;margin:16px 0 0;">Try to Dink · trytodink.com</p>
  </td></tr>
</table>
```
Subject: `Confirm your Try to Dink account`

---

## Magic Link

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #D9D4C7;border-radius:18px;">
      <tr><td style="padding:28px 32px 4px;">
        <span style="font-family:Georgia,serif;font-size:22px;color:#27241D;">Try to <span style="color:#5C8A3B;font-style:italic;">Dink</span></span>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.15;color:#27241D;margin:0 0 12px;">Your sign-in link</h1>
        <p style="font-size:15px;line-height:1.55;color:#534F45;margin:0 0 24px;">Tap to sign in. This link expires shortly and can be used once.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px;">
        <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/"
           style="display:inline-block;background:#9CD96B;color:#1a2e0f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:14px;">Sign in &rarr;</a>
      </td></tr>
      <tr><td style="padding:20px 32px 28px;">
        <p style="font-size:12px;line-height:1.5;color:#857F73;margin:0;">Didn't ask to sign in? Ignore this email.</p>
      </td></tr>
    </table>
    <p style="font-size:11px;color:#857F73;margin:16px 0 0;">Try to Dink · trytodink.com</p>
  </td></tr>
</table>
```
Subject: `Your Try to Dink sign-in link`

---

## Invite User

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #D9D4C7;border-radius:18px;">
      <tr><td style="padding:28px 32px 4px;">
        <span style="font-family:Georgia,serif;font-size:22px;color:#27241D;">Try to <span style="color:#5C8A3B;font-style:italic;">Dink</span></span>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.15;color:#27241D;margin:0 0 12px;">You're invited to play</h1>
        <p style="font-size:15px;line-height:1.55;color:#534F45;margin:0 0 24px;">Someone invited you to a Try to Dink event. Tap to set up your account and join the fun.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px;">
        <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/"
           style="display:inline-block;background:#9CD96B;color:#1a2e0f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:14px;">Accept invite &rarr;</a>
      </td></tr>
      <tr><td style="padding:20px 32px 28px;">
        <p style="font-size:12px;line-height:1.5;color:#857F73;margin:0;">Not expecting this? You can ignore this email.</p>
      </td></tr>
    </table>
    <p style="font-size:11px;color:#857F73;margin:16px 0 0;">Try to Dink · trytodink.com</p>
  </td></tr>
</table>
```
Subject: `You're invited to a Try to Dink event`
