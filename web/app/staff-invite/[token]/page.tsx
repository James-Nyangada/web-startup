"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Icon, I } from "@/components/icons";
import { apiClient } from "@/lib/api";

interface StaffInvitationDetails {
  valid: boolean;
  email: string;
  role: string;
  displayName: string | null;
  hasAccount: boolean;
  expiresAt: string;
}

export default function AcceptStaffInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<StaffInvitationDetails | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiClient<StaffInvitationDetails>(`/v1/staff-invitations/${token}`)
      .then((res) => {
        if (!mounted) return;
        setInvitation(res);
        setName(res.displayName || res.email.split("@")[0] || "");
        setLoading(false);
      })
      .catch((err: { code?: string }) => {
        if (!mounted) return;
        setLoading(false);
        const code = err?.code || "";
        if (code === "INVITATION_EXPIRED") setErrorStatus("This invitation has expired. Ask for a new one.");
        else if (code === "INVITATION_ALREADY_ACCEPTED") setErrorStatus("This invitation has already been accepted.");
        else if (code === "INVITATION_REVOKED") setErrorStatus("This invitation was revoked.");
        else setErrorStatus("This invitation link is invalid or could not be loaded.");
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!invitation?.hasAccount && password.length < 10) {
      setFormError("Password must be at least 10 characters long.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient("/v1/staff-invitations/accept", {
        method: "POST",
        body: JSON.stringify({
          token,
          name: name.trim() || undefined,
          password: invitation?.hasAccount ? undefined : password,
        }),
      });
      router.push("/sign-in?redirect=/staff");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to accept invitation.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthCard title="Checking invitation..." description="Verifying your invitation link">
        <div className="flex items-center justify-center p-8">
          <Icon d={I.refresh} size={28} className="animate-spin text-primary" />
        </div>
      </AuthCard>
    );
  }

  if (errorStatus || !invitation) {
    return (
      <AuthCard title="Invalid Invitation" description="We couldn't process this invitation link.">
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

  const inputCls =
    "h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <AuthCard
      title="Join the staff portal"
      description="You've been invited to join the team."
      error={formError}
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-line bg-subtle/50 p-4 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2 mb-2">
            <span className="text-muted uppercase tracking-wider font-semibold">Role</span>
            <span className="font-semibold text-primary capitalize">{invitation.role}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted uppercase tracking-wider font-semibold">Email</span>
            <span className="font-mono text-ink">{invitation.email}</span>
          </div>
        </div>

        <form onSubmit={handleAccept} className="flex flex-col gap-4">
          {invitation.hasAccount ? (
            <p className="m-0 text-xs text-muted">
              An account already exists for this email. Accept to add staff access, then sign in with your usual password.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="staff-inv-name" className="text-xs font-semibold text-ink uppercase tracking-wider">
                  Your Full Name
                </label>
                <input
                  id="staff-inv-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="staff-inv-pw" className="text-xs font-semibold text-ink uppercase tracking-wider">
                    Create a Password
                  </label>
                  <span className="text-xs text-muted">Min 10 characters</span>
                </div>
                <input
                  id="staff-inv-pw"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                />
              </div>
            </>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="ease-ui mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? "Setting up..." : "Accept invitation & continue"}
          </button>
        </form>
      </div>
    </AuthCard>
  );
}
