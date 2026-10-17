'use client';

import React, { Suspense, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { authClient, ApiException } from '@/lib/auth-client';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const errorRef = useRef<HTMLDivElement | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!token) {
    return (
      <AuthCard
        title="Invalid reset link"
        description="This password reset link is missing a valid token or has expired."
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-relaxed">
            Password reset links expire after 1 hour or after they have been used. Please request a new
            link.
          </p>
          <div className="pt-2">
            <Link
              href="/forgot-password"
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm transition"
            >
              Request a new link
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  if (isSuccess) {
    return (
      <AuthCard
        title="Password updated"
        description="Your password has been reset successfully."
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-relaxed">
            You can now sign in with your new password.
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < 10) {
      setErrorMessage('Password must be at least 10 characters long.');
      errorRef.current?.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      errorRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await authClient.resetPassword({ token, newPassword });
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        if (err.code === 'INVALID_TOKEN') {
          setErrorMessage('This reset link has expired or already been used.');
        } else {
          setErrorMessage(err.message);
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
      title="Create new password"
      description="Choose a strong, unique password for your Plainsight account."
      error={errorMessage}
      errorRef={errorRef}
      footer={
        <p>
          <Link href="/sign-in" className="text-ink font-semibold hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-ink mb-1.5">
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            aria-describedby="new-password-hint"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-line bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
          />
          <p id="new-password-hint" className="mt-1 text-xs text-muted">
            Must be at least 10 characters long and not easily guessable.
          </p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink mb-1.5">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-line bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            {isSubmitting ? 'Resetting password...' : 'Update password'}
          </button>
        </div>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-page" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
