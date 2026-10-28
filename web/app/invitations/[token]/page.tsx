"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Icon, I } from "@/components/icons";
import { apiClient } from "@/lib/api";

interface InvitationDetails {
  valid: boolean;
  orgName: string;
  orgSlug: string;
  email: string;
  role: string;
  expiresAt: string;
  inviterName?: string | null;
}

export default function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  // Form state for new or existing users
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiClient<{
      valid: boolean;
      orgName: string;
      orgSlug: string;
      email: string;
      role: string;
      expiresAt: string;
      inviterName?: string | null;
    }>(`/v1/invitations/${token}`)
      .then((res) => {
        if (!mounted) return;
        setInvitation(res);
        setName(res.email.split("@")[0] || "");
        setLoading(false);
      })
      .catch((err: any) => {
        if (!mounted) return;
        setLoading(false);
        const code = err?.code || "";
        if (code === "INVITATION_EXPIRED") {
          setErrorStatus("This invitation expired after 7 days. Please request a new invite.");
        } else if (code === "INVITATION_ALREADY_ACCEPTED") {
          setErrorStatus("This invitation has already been accepted.");
        } else if (code === "INVITATION_REVOKED") {
          setErrorStatus("This invitation was revoked by an organisation administrator.");
        } else {
          setErrorStatus("This invitation link is invalid or could not be loaded.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password && password.length < 10) {
      setFormError("Password must be at least 10 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient<{ ok: boolean; orgSlug: string; orgId: string }>(
        "/v1/invitations/accept",
        {
          method: "POST",
          body: JSON.stringify({
            token,
            name: name.trim() || undefined,
            password: password || undefined,
          }),
        },
      );

      const target = res?.orgSlug ? `/${res.orgSlug}/sites` : "/overview";
      router.push(target);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to accept invitation.";
      setFormError(msg);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthCard title="Checking invitation..." description="Verifying your invitation token">
        <div className="flex items-center justify-center p-8">
          <Icon d={I.refresh} size={28} className="animate-spin text-primary" />
        </div>
      </AuthCard>
    );
  }

  if (errorStatus || !invitation) {
    return (
      <AuthCard
        title="Invalid Invitation"
        description="We couldn't process this invitation link."
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-crit-soft border border-crit/20 p-4 text-sm text-crit">
            {errorStatus || "This invitation link is invalid or no longer exists."}
          </div>
          <div className="flex justify-center pt-2">
            <Link
              href="/sign-in"
              className="ease-ui flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover no-underline"
            >
              Go to sign in
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  const roleDisplay =
    invitation.role === "admin"
      ? "Administrator"
      : invitation.role === "client_viewer"
        ? "Client Viewer"
        : "Team Member";

  return (
    <AuthCard
      title={`Join ${invitation.orgName}`}
      description={
        invitation.inviterName
          ? `${invitation.inviterName} has invited you to collaborate on web accessibility audits.`
          : "You've been invited to collaborate on web accessibility audits."
      }
      error={formError}
    >
      <div className="flex flex-col gap-5">
        {/* Invitation Summary Badge Card */}
        <div className="rounded-xl border border-line bg-subtle/50 p-4 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2 mb-2">
            <span className="text-muted uppercase tracking-wider font-semibold">Organisation</span>
            <span className="font-semibold text-ink text-sm">{invitation.orgName}</span>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2 mb-2">
            <span className="text-muted uppercase tracking-wider font-semibold">Assigned Role</span>
            <span className="font-semibold text-primary">{roleDisplay}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted uppercase tracking-wider font-semibold">Invited Email</span>
            <span className="font-mono text-ink">{invitation.email}</span>
          </div>
        </div>

        {/* Acceptance Form */}
        <form onSubmit={handleAccept} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="inv-name" className="text-xs font-semibold text-ink uppercase tracking-wider">
              Your Full Name
            </label>
            <input
              id="inv-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Johnson"
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="inv-pw" className="text-xs font-semibold text-ink uppercase tracking-wider">
                Create a Password
              </label>
              <span className="text-xs text-muted">Min 10 characters</span>
            </div>
            <input
              id="inv-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-xs text-muted">
              If you already have an account, leave blank and click below to join with your existing credentials.
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="ease-ui mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? "Joining team..." : `Accept invitation & join ${invitation.orgName}`}
          </button>
        </form>

        <div className="text-center pt-2 text-xs text-muted">
          Already have an account?{" "}
          <Link href={`/sign-in?redirect=/invitations/${token}`} className="font-semibold text-primary hover:underline">
            Sign in first
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
