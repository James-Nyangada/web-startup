'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { authClient, ApiException } from '@/lib/auth-client';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'missing-token'>(
    token ? 'verifying' : 'missing-token',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('missing-token');
      return;
    }

    let isMounted = true;
    authClient
      .verifyEmail(token)
      .then(() => {
        if (isMounted) setStatus('success');
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setStatus('error');
        if (err instanceof ApiException) {
          setErrorMessage(err.message || 'Verification token is invalid or has expired.');
        } else {
          setErrorMessage('Unable to verify your email. Please try again.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (status === 'verifying') {
    return (
      <AuthCard
        title="Verifying your email"
        description="Please wait while we confirm your email address..."
      >
        <div className="flex justify-center py-8">
          <div
            role="status"
            aria-label="Verifying email"
            className="size-8 rounded-full border-2 border-line border-t-primary animate-spin"
          />
        </div>
      </AuthCard>
    );
  }

  if (status === 'success') {
    return (
      <AuthCard
        title="Email verified"
        description="Your email address has been verified successfully."
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-ok-soft border border-ok/20 p-3.5 text-sm text-ok flex items-center gap-2.5">
            <svg
              aria-hidden="true"
              className="size-5 shrink-0 text-ok"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="font-medium">You now have full access to Plainsight.</span>
          </div>

          <div className="pt-2">
            <Link
              href="/overview"
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm transition"
            >
              Go to overview
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Verification failed"
      description="We could not verify your email address."
      error={errorMessage || 'The verification link is invalid or has expired.'}
      footer={
        <p>
          <Link href="/sign-in" className="text-ink font-semibold hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink leading-relaxed">
          Verification links are single-use and expire after 7 days. You can sign in to your
          account to request a fresh verification link at any time.
        </p>
        <div className="pt-2">
          <Link
            href="/sign-in"
            className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm transition"
          >
            Sign in to your account
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-page" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
