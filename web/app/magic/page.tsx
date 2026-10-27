'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { authClient, ApiException } from '@/lib/auth-client';
import { landingPathAfterSignIn } from '@/lib/post-sign-in';

function MagicLinkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const errorRef = useRef<HTMLDivElement | null>(null);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(Boolean(token));
  const [verificationFailed, setVerificationFailed] = useState(false);

  // If a token is in the URL, verify it automatically
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    setIsVerifying(true);

    authClient
      .verifyMagicLink(token)
      .then(() => landingPathAfterSignIn())
      .then((path) => {
        if (isMounted) {
          router.push(path);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setIsVerifying(false);
        setVerificationFailed(true);
        if (err instanceof ApiException) {
          setErrorMessage(err.message || 'Magic link is invalid or has expired.');
        } else {
          setErrorMessage('Failed to verify magic link. Please request a new one.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token, router]);

  if (isVerifying) {
    return (
      <AuthCard
        title="Signing you in"
        description="Verifying your magic link and preparing your dashboard..."
      >
        <div className="flex justify-center py-8">
          <div
            role="status"
            aria-label="Signing in"
            className="size-8 rounded-full border-2 border-line border-t-primary animate-spin"
          />
        </div>
      </AuthCard>
    );
  }

  if (isSent) {
    return (
      <AuthCard
        title="Check your inbox"
        description={`We sent a magic sign-in link to ${email}.`}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-relaxed">
            Click the link in the email to sign in instantly without a password. The link is valid
            for 15 minutes.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsSent(false)}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg border border-line hover:bg-subtle text-ink font-medium text-sm transition"
            >
              Send another link
            </button>
          </div>
        </div>
      </AuthCard>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid work email address.');
      errorRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await authClient.requestMagicLink(email);
      setIsSent(true);
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to send magic link. Please try again.');
      }
      setTimeout(() => errorRef.current?.focus(), 50);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Sign in with a magic link"
      description="Enter your email and we'll send you a password sign-in link."
      error={errorMessage}
      errorRef={errorRef}
      footer={
        <p>
          Prefer password sign in?{' '}
          <Link href="/sign-in" className="text-ink font-semibold hover:underline">
            Sign in with password
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-line bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            placeholder="jane@company.com"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            {isSubmitting ? 'Sending link...' : 'Send magic link'}
          </button>
        </div>
      </form>
    </AuthCard>
  );
}

export default function MagicPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-page" />}>
      <MagicLinkContent />
    </Suspense>
  );
}
