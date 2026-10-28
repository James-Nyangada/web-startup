'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { ApiException, authClient } from '@/lib/auth-client';
import { mfaClient, passkeysSupported, type MfaStatus } from '@/lib/mfa-client';
import { landingPathAfterSignIn } from '@/lib/post-sign-in';

function VerifyContent() {
  const router = useRouter();
  const requestedRedirect = useSearchParams().get('redirect');
  const errorRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mfaClient
      .status()
      .then(async (s) => {
        if (!s.pending) router.replace(await landingPathAfterSignIn(requestedRedirect));
        else setStatus(s);
      })
      .catch(() => router.replace('/sign-in'));
  }, [router, requestedRedirect]);

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiException) setError(err.message);
    else if (err instanceof Error && err.name === 'NotAllowedError') setError('Passkey prompt was cancelled.');
    else setError(fallback);
    setTimeout(() => errorRef.current?.focus(), 50);
  };

  const done = async () => router.push(await landingPathAfterSignIn(requestedRedirect));

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await mfaClient.verifyCode(code);
      await done();
    } catch (err) {
      fail(err, 'Could not verify that code.');
    } finally {
      setBusy(false);
    }
  }

  async function usePasskey() {
    setError(null);
    setBusy(true);
    try {
      await mfaClient.verifyPasskey();
      await done();
    } catch (err) {
      fail(err, 'Could not verify your passkey.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    await authClient.signOut().catch(() => {});
    router.push('/sign-in');
  }

  const hasPasskey = Boolean(status?.passkeys.length) && passkeysSupported();
  const hasTotp = Boolean(status?.totpEnabled);

  return (
    <AuthCard
      title="Two-step verification"
      description="Confirm it's you. You won't be asked again on this account for the next 24 hours."
      error={error}
      errorRef={errorRef}
      footer={
        <button type="button" onClick={cancel} className="text-ink font-semibold hover:underline">
          Cancel and sign out
        </button>
      }
    >
      {!status ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-5">
          {hasPasskey && (
            <button
              type="button"
              onClick={usePasskey}
              disabled={busy}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-60"
            >
              {busy ? 'Waiting for passkey…' : 'Use a passkey'}
            </button>
          )}

          {hasTotp && (
            <form onSubmit={submitCode} className="space-y-3" noValidate>
              <label htmlFor="mfa-code" className="block text-sm font-medium text-ink">
                {useRecovery ? 'Recovery code' : 'Authenticator code'}
              </label>
              <input
                id="mfa-code"
                inputMode={useRecovery ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoFocus={!hasPasskey}
                maxLength={useRecovery ? 12 : 7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'}
                className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-center font-mono text-lg tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={busy || code.trim().length < 6}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${
                  hasPasskey ? 'border border-line text-ink' : 'bg-primary text-on-primary'
                }`}
              >
                {busy ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseRecovery((v) => !v);
                  setCode('');
                  setError(null);
                }}
                className="w-full text-xs text-muted underline underline-offset-2 hover:text-ink"
              >
                {useRecovery ? 'Use your authenticator app instead' : 'Lost your device? Use a recovery code'}
              </button>
            </form>
          )}

          {!hasPasskey && !hasTotp && (
            <p className="text-sm text-muted">
              This device can&apos;t use your passkey and no authenticator app is set up.{' '}
              <Link href="/sign-in" className="underline">Back to sign in</Link>
            </p>
          )}
        </div>
      )}
    </AuthCard>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  );
}
