'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { authClient, ApiException } from '@/lib/auth-client';

export default function SignUpPage() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);

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
              href="/sign-in"
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
            required
            autoComplete="email"
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) {
                setFieldErrors((prev) => ({ ...prev, email: '' }));
              }
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
          <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby="password-hint password-error"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) {
                setFieldErrors((prev) => ({ ...prev, password: '' }));
              }
            }}
            className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 transition ${
              fieldErrors.password
                ? 'border-crit focus:ring-crit'
                : 'border-line focus:ring-primary focus:border-transparent'
            }`}
          />
          <p id="password-hint" className="mt-1 text-xs text-muted">
            Must be at least 10 characters long and not easily guessable.
          </p>
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
            {isSubmitting ? 'Creating account...' : 'Create account'}
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
