'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { authClient, ApiException } from '@/lib/auth-client';
import { Icon, I } from '@/components/icons';

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorRef = useRef<HTMLDivElement | null>(null);

  const urlParam = searchParams.get('url') || '';
  const checkIdParam = searchParams.get('checkId') || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string>(urlParam);
  const [pendingCheckId, setPendingCheckId] = useState<string>(checkIdParam);

  useEffect(() => {
    if (urlParam) {
      setPendingUrl(urlParam);
      try {
        localStorage.setItem('plainsight_pending_url', urlParam);
      } catch {}
    } else {
      try {
        const savedUrl = localStorage.getItem('plainsight_pending_url');
        if (savedUrl) setPendingUrl(savedUrl);
      } catch {}
    }

    if (checkIdParam) {
      setPendingCheckId(checkIdParam);
      try {
        localStorage.setItem('plainsight_pending_check_id', checkIdParam);
      } catch {}
    } else {
      try {
        const savedCheck = localStorage.getItem('plainsight_pending_check_id');
        if (savedCheck) setPendingCheckId(savedCheck);
      } catch {}
    }
  }, [urlParam, checkIdParam]);

  const passwordTooShort = password.length > 0 && password.length < 10;
  const isPasswordValid = password.length >= 10;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!email) {
      errors.email = 'Email address is required.';
    } else if (!email.includes('@')) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 10) {
      errors.password = 'Password must be at least 10 characters long.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setErrorMessage('Please fix the errors below.');
      errorRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await authClient.signUp({
        email,
        password,
        name: name.trim() || undefined,
      });
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        if (err.code === 'EMAIL_ALREADY_EXISTS') {
          setErrorMessage('An account with this email already exists.');
          setFieldErrors({ email: 'An account with this email already exists.' });
        } else if (err.code === 'PASSWORD_TOO_WEAK') {
          setErrorMessage(err.message || 'Password does not meet security requirements.');
          setFieldErrors({ password: err.message });
        } else {
          setErrorMessage(err.message || 'Registration failed. Please try again.');
        }
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
      setTimeout(() => errorRef.current?.focus(), 50);
    } finally {
      setIsSubmitting(false);
    }
  }

  const continueQuery = new URLSearchParams();
  if (pendingUrl) continueQuery.set('url', pendingUrl);
  if (pendingCheckId) continueQuery.set('checkId', pendingCheckId);
  const continueUrl = pendingUrl
    ? `/sign-in?continue=${encodeURIComponent(`/onboarding?${continueQuery.toString()}`)}`
    : '/sign-in';

  if (isSuccess) {
    return (
      <AuthCard
        title="Check your inbox"
        description={`We sent a verification link to ${email}.`}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-relaxed">
            Click the link in the email to verify your address. You can also sign in right away,
            though some features will be restricted until your email is verified.
          </p>
          <div className="pt-2">
            <Link
              href={continueUrl}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm transition"
            >
              Continue to sign in
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      description="Start monitoring your online store accessibility today."
      error={errorMessage}
      errorRef={errorRef}
      footer={
        <p>
          Already have an account?{' '}
          <Link href="/sign-in" className="text-ink font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {pendingUrl && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary-soft p-3 text-xs text-ink">
          <Icon d={I.globe} size={16} className="text-ptext flex-none" />
          <span className="font-medium">
            Monitoring <strong className="font-semibold text-ptext">{pendingUrl}</strong>, 14-day free trial included
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-ink mb-1.5">
            Full name <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-line bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full px-3.5 py-2.5 text-sm rounded-lg border ${
              fieldErrors.email ? 'border-crit' : 'border-line'
            } bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition`}
            placeholder="you@company.com"
          />
          {fieldErrors.email && (
            <p className="mt-1 text-xs text-crit">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
            Password <span className="text-muted font-normal">(10+ characters)</span>
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full px-3.5 py-2.5 text-sm rounded-lg border ${
              fieldErrors.password || passwordTooShort ? 'border-crit' : 'border-line'
            } bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition`}
            placeholder="••••••••••••"
          />
          {passwordTooShort && (
            <p className="mt-1 text-xs text-crit">
              Password must be at least 10 characters long ({password.length}/10).
            </p>
          )}
          {fieldErrors.password && !passwordTooShort && (
            <p className="mt-1 text-xs text-crit">{fieldErrors.password}</p>
          )}
          {isPasswordValid && (
            <p className="mt-1 text-xs text-ok">Password meets length requirement.</p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm transition disabled:opacity-50"
          >
            {isSubmitting ? 'Creating account…' : 'Start 14-day free trial'}
          </button>
        </div>

        <p className="text-xs text-muted text-center pt-2">
          By signing up, you agree to our{' '}
          <Link href="/terms" className="underline hover:text-ink">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center bg-surface">
          <span className="size-6 animate-spin rounded-full border-2 border-primary border-r-transparent" />
        </div>
      }
    >
      <SignUpContent />
    </Suspense>
  );
}
