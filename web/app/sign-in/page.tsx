'use client';

import React, { Suspense, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { authClient, ApiException } from '@/lib/auth-client';
import { landingPathAfterSignIn } from '@/lib/post-sign-in';

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get('redirect');

  const errorRef = useRef<HTMLDivElement | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!email) errors.email = 'Email address is required.';
    if (!password) errors.password = 'Password is required.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setErrorMessage('Please enter both your email and password.');
      errorRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await authClient.signIn({ email, password });
      router.push(await landingPathAfterSignIn(requestedRedirect));
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        if (err.code === 'RATE_LIMITED') {
          setErrorMessage(err.message);
        } else if (err.code === 'INVALID_CREDENTIALS') {
          setErrorMessage('Email or password is incorrect.');
        } else {
          setErrorMessage(err.message || 'Failed to sign in. Please try again.');
        }
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
      setTimeout(() => errorRef.current?.focus(), 50);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Sign in to Plainsight"
      description="Welcome back. Enter your credentials to access your dashboard."
      error={errorMessage}
      errorRef={errorRef}
      footer={
        <p>
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="text-ink font-semibold hover:underline">
            Create an account
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
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
            }}
            className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 transition ${
              fieldErrors.email
                ? 'border-crit focus:ring-crit'
                : 'border-line focus:ring-primary focus:border-transparent'
            }`}
            placeholder="jane@company.com"
          />
          {fieldErrors.email && (
            <p id="email-error" role="alert" className="mt-1 text-xs text-crit font-medium">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted hover:text-ink transition underline underline-offset-2"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
            }}
            className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 transition ${
              fieldErrors.password
                ? 'border-crit focus:ring-crit'
                : 'border-line focus:ring-primary focus:border-transparent'
            }`}
          />
          {fieldErrors.password && (
            <p id="password-error" role="alert" className="mt-1 text-xs text-crit font-medium">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </div>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-surface px-2 text-muted">or</span>
          </div>
        </div>

        <div>
          <Link
            href="/magic"
            className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg border border-line hover:bg-subtle text-ink font-medium text-sm transition"
          >
            Sign in with a magic link
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-page" />}>
      <SignInContent />
    </Suspense>
  );
}
