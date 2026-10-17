'use client';

import React, { useState } from 'react';
import { authClient, ApiException } from '@/lib/auth-client';

interface UnverifiedBannerProps {
  email?: string;
  onResent?: () => void;
}

export function UnverifiedBanner({ email, onResent }: UnverifiedBannerProps) {
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleResend() {
    if (!email) return;
    setIsSending(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      // In Better Auth / our auth flow, re-requesting verification
      await authClient.requestMagicLink(email);
      setStatusMessage('Verification link resent. Please check your inbox.');
      onResent?.();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to resend verification email.');
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <aside
      aria-label="Email verification notice"
      className="bg-ser-soft border-b border-ser/20 px-4 py-2.5 text-ser text-sm"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg
            aria-hidden="true"
            className="size-4 shrink-0 text-ser"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <span className="font-medium">
            Please verify your email address to unlock full features, including inviting team members.
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {statusMessage ? (
            <span className="text-ok font-medium" role="status">
              {statusMessage}
            </span>
          ) : errorMessage ? (
            <span className="text-crit font-medium" role="alert">
              {errorMessage}
            </span>
          ) : email ? (
            <button
              type="button"
              onClick={handleResend}
              disabled={isSending}
              className="font-semibold underline underline-offset-2 hover:text-ink transition disabled:opacity-50"
            >
              {isSending ? 'Sending...' : 'Resend verification link'}
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
