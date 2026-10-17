'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/logo';

interface AuthCardProps {
  title: string;
  description?: string;
  error?: string | null;
  errorRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthCard({
  title,
  description,
  error,
  errorRef,
  children,
  footer,
}: AuthCardProps) {
  return (
    <main className="min-h-screen bg-page flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo href="/" />
        </div>

        <div className="bg-surface border border-line rounded-2xl p-6 sm:p-8 shadow-sm">
          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">{title}</h1>
            {description && (
              <p className="mt-1.5 text-sm text-muted leading-relaxed">{description}</p>
            )}
          </header>

          {error && (
            <div
              ref={errorRef}
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
              className="mb-6 rounded-lg bg-crit-soft border border-crit/20 p-3.5 text-sm text-crit focus:outline-none focus:ring-2 focus:ring-crit/30"
            >
              <div className="flex items-start gap-2.5">
                <svg
                  aria-hidden="true"
                  className="size-5 shrink-0 text-crit mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <span className="font-medium">{error}</span>
              </div>
            </div>
          )}

          {children}

          {footer && (
            <footer className="mt-6 pt-6 border-t border-line text-center text-sm text-muted">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </main>
  );
}
