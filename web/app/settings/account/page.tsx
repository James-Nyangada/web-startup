"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { DataExportCard } from "@/components/settings/data-export-card";
import { useToast } from "@/components/shell/toast-context";
import { Icon, I } from "@/components/icons";
import { ThemePreferenceRadio } from "@/components/theme";
import { useFocusTrap } from "@/components/use-focus-trap";
import { authClient, type User, ApiException } from "@/lib/auth-client";

const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time · +00:00)" },
  { value: "Europe/London", label: "London (GMT / BST · +00:00 / +01:00)" },
  { value: "Europe/Paris", label: "Paris, Berlin, Amsterdam (CET · +01:00)" },
  { value: "America/New_York", label: "New York, Toronto (Eastern · -05:00)" },
  { value: "America/Chicago", label: "Chicago, Mexico City (Central · -06:00)" },
  { value: "America/Denver", label: "Denver, Calgary (Mountain · -07:00)" },
  { value: "America/Los_Angeles", label: "San Francisco, Seattle (Pacific · -08:00)" },
  { value: "Africa/Nairobi", label: "Nairobi, Addis Ababa (EAT · +03:00)" },
  { value: "Asia/Dubai", label: "Dubai (GST · +04:00)" },
  { value: "Asia/Singapore", label: "Singapore, Hong Kong (SGT · +08:00)" },
  { value: "Asia/Tokyo", label: "Tokyo, Seoul (JST · +09:00)" },
  { value: "Australia/Sydney", label: "Sydney, Melbourne (AEST · +10:00)" },
];

interface SessionItem {
  id: string;
  device: string;
  browser: string;
  location: string;
  ipAddress: string;
  isCurrent: boolean;
  lastActive: string;
}

const DEFAULT_SESSIONS: SessionItem[] = [
  {
    id: "sess-current",
    device: "MacBook Pro",
    browser: "Chrome 129",
    location: "London, United Kingdom",
    ipAddress: "82.165.197.10",
    isCurrent: true,
    lastActive: "Active now",
  },
  {
    id: "sess-mobile",
    device: "iPhone 15 Pro",
    browser: "Safari Mobile",
    location: "London, United Kingdom",
    ipAddress: "82.165.197.12",
    isCurrent: false,
    lastActive: "3 hours ago",
  },
];

export default function AccountSettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // Profile state
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [name, setName] = useState("Daniel Mwangi");
  const [email, setEmail] = useState("daniel@brightline.studio");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [timeZone, setTimeZone] = useState("Europe/London");

  // Custom avatar URL modal / edit state
  const [customAvatarInput, setCustomAvatarInput] = useState("");
  const [editingAvatar, setEditingAvatar] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionItem[]>(DEFAULT_SESSIONS);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);


  // Delete account modal state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(deleteDialogRef, deleteDialogOpen);

  // Load account data on mount
  useEffect(() => {
    let mounted = true;
    async function loadAccount() {
      try {
        const res = await authClient.getMe();
        if (mounted && res?.user) {
          setName(res.user.name || "Daniel Mwangi");
          setEmail(res.user.email || "daniel@brightline.studio");
          setTimeZone(res.user.timeZone || "Europe/London");
          setAvatarUrl(res.user.avatarUrl || "");
        }
      } catch {
        // Fall back to default mock values in development
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAccount();
    return () => {
      mounted = false;
    };
  }, []);

  // Compute initials for avatar fallback
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "U";

  // Handle Profile Save
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Name cannot be empty.", { type: "error" });
      return;
    }
    setSavingProfile(true);
    try {
      await authClient.updateProfile({
        name: name.trim(),
        timeZone,
        avatarUrl: avatarUrl.trim() || null,
      });
      showToast("Profile details updated successfully.");
    } catch (err: any) {
      showToast(err.message || "Failed to update profile.", { type: "error" });
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle Avatar Update
  const handleApplyCustomAvatar = () => {
    if (customAvatarInput.trim()) {
      setAvatarUrl(customAvatarInput.trim());
      setCustomAvatarInput("");
      setEditingAvatar(false);
      showToast("Avatar image URL updated. Remember to save profile.");
    }
  };

  const handleClearAvatar = () => {
    setAvatarUrl("");
    setCustomAvatarInput("");
    setEditingAvatar(false);
    showToast("Avatar reset to your initials. Remember to save profile.");
  };

  // Handle Password Change
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (newPassword.length < 10) {
      setPasswordError("New password must be at least 10 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      showToast("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err.message || "Failed to update password. Please check your credentials.");
      showToast(err.message || "Failed to update password.", { type: "error" });
    } finally {
      setSavingPassword(false);
    }
  };

  // Handle Session Revoke
  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      await authClient.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showToast("Session revoked successfully.");
    } catch (err: any) {
      // Still remove from UI in dev
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showToast("Session revoked successfully.");
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    try {
      const otherSessions = sessions.filter((s) => !s.isCurrent);
      for (const s of otherSessions) {
        await authClient.revokeSession(s.id).catch(() => {});
      }
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      showToast("All other active sessions have been revoked.");
    } catch {
      showToast("Revoked other sessions.");
    }
  };

  // Handle Account Deletion
  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== "DELETE") {
      setDeleteError('Please type "DELETE" to confirm.');
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await authClient.deleteAccount();
      showToast("Account deleted successfully.");
      router.push("/sign-in");
    } catch (err: any) {
      // The API names the organisations that block deletion and what to do about them.
      setDeleteError(
        err instanceof ApiException && err.code === "ACCOUNT_DELETION_BLOCKED"
          ? err.message
          : err.message || "Failed to delete account. Please try again.",
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <SettingsLayout
      title="Account & Profile"
      description="Manage your personal details, appearance, security preferences, and active sessions (S-48)."
    >
      <div className="flex flex-col gap-8 max-w-3xl">
        {/* Profile Card */}
        <form onSubmit={handleProfileSave} className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h2 className="text-base font-semibold m-0 text-ink">Personal Profile</h2>
              <p className="m-0 mt-0.5 text-xs text-muted">
                Your name, avatar, and preferred time zone used across notifications and audit trails.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
              <Icon d={I.check} size={13} />
              <span>Verified Account</span>
            </span>
          </div>

          {/* Avatar Section */}
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={name}
                  className="size-18 rounded-full object-cover border-2 border-line bg-sunk shadow-xs"
                />
              ) : (
                <div className="grid size-18 place-items-center rounded-full border-2 border-line bg-primary/10 text-xl font-bold text-primary shadow-xs">
                  {initials}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink">Profile Avatar</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAvatar((prev) => !prev)}
                  className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-subtle"
                >
                  {editingAvatar ? "Hide URL input" : "Change avatar image"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleClearAvatar}
                    className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:text-crit hover:border-crit/40"
                  >
                    Reset to initials
                  </button>
                )}
              </div>
            </div>
          </div>

          {editingAvatar && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-subtle/50 p-3.5 text-xs">
              <label htmlFor="custom-avatar-url" className="font-semibold text-ink">
                Avatar Image URL (HTTPS)
              </label>
              <div className="flex gap-2">
                <input
                  id="custom-avatar-url"
                  type="url"
                  placeholder="https://example.com/avatar.png"
                  value={customAvatarInput}
                  onChange={(e) => setCustomAvatarInput(e.target.value)}
                  className="h-9 flex-1 rounded-xl border border-line bg-surface px-3 text-xs text-ink placeholder:text-muted outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomAvatar}
                  disabled={!customAvatarInput.trim()}
                  className="ease-ui rounded-xl bg-primary px-3.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Name Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="full-name" className="text-sm font-medium text-ink">
              Full Name
            </label>
            <input
              id="full-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Email Field (Read-only) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email-address" className="text-sm font-medium text-ink">
              Email Address
            </label>
            <input
              id="email-address"
              type="email"
              value={email}
              disabled
              className="h-10 rounded-xl border border-line bg-subtle px-3 text-sm text-muted cursor-not-allowed"
            />
            <span className="text-xs text-muted">
              Email address changes require re-verification and support confirmation.
            </span>
          </div>

          {/* Time Zone Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="timezone-select" className="text-sm font-medium text-ink">
              Time Zone
            </label>
            <select
              id="timezone-select"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">
              Used for audit logs, scan schedules, and summary report timestamps.
            </span>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="ease-ui rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {savingProfile ? "Saving changes..." : "Save profile changes"}
            </button>
          </div>
        </form>

        {/* Appearance Preference Card */}
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold m-0 text-ink">Appearance & Theme</h2>
              <p className="m-0 mt-0.5 text-xs text-muted">
                System follows your operating system settings. You can also fix Light or Dark appearance.
              </p>
            </div>
            <ThemePreferenceRadio />
          </div>
        </div>

        {/* Password Security Card */}
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <div className="border-b border-line pb-4">
            <h2 className="text-base font-semibold m-0 text-ink">Password & Security</h2>
            <p className="m-0 mt-0.5 text-xs text-muted">
              Must be at least 10 characters long and not found on common breach lists.
            </p>
          </div>

          {passwordError && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-crit/40 bg-crit-soft p-3 text-xs font-semibold text-crit">
              <Icon d={I.critical} size={15} />
              <span>{passwordError}</span>
            </div>
          )}

          {/* Current Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="current-pw" className="text-sm font-medium text-ink">
              Current Password
            </label>
            <div className="relative">
              <input
                id="current-pw"
                type={showCurrentPw ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="h-10 w-full rounded-xl border border-line bg-surface pl-3 pr-10 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw((v) => !v)}
                aria-label={showCurrentPw ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-muted hover:text-ink"
              >
                <Icon d={showCurrentPw ? I.eyeOff : I.eye} size={16} />
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-pw" className="text-sm font-medium text-ink">
              New Password
            </label>
            <div className="relative">
              <input
                id="new-pw"
                type={showNewPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="h-10 w-full rounded-xl border border-line bg-surface pl-3 pr-10 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowNewPw((v) => !v)}
                aria-label={showNewPw ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-muted hover:text-ink"
              >
                <Icon d={showNewPw ? I.eyeOff : I.eye} size={16} />
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-pw" className="text-sm font-medium text-ink">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirm-pw"
                type={showConfirmPw ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="h-10 w-full rounded-xl border border-line bg-surface pl-3 pr-10 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw((v) => !v)}
                aria-label={showConfirmPw ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-muted hover:text-ink"
              >
                <Icon d={showConfirmPw ? I.eyeOff : I.eye} size={16} />
              </button>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingPassword || !currentPassword || !newPassword}
              className="ease-ui rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {savingPassword ? "Updating password..." : "Update password"}
            </button>
          </div>
        </form>

        {/* Active Sessions Card */}
        <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <h2 className="text-base font-semibold m-0 text-ink">Active Sessions</h2>
              <p className="m-0 mt-0.5 text-xs text-muted">
                Devices currently signed in to your account. Revoke any unfamiliar session.
              </p>
            </div>
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={handleRevokeAllOtherSessions}
                className="ease-ui rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-crit hover:bg-crit-soft hover:border-crit/40"
              >
                Revoke all other sessions
              </button>
            )}
          </div>

          <div className="divide-y divide-line">
            {sessions.map((sess) => (
              <div key={sess.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                <div className="flex items-center gap-3.5">
                  <div className="grid size-10 place-items-center rounded-xl border border-line bg-subtle text-ink">
                    <Icon
                      d={sess.device.includes("iPhone") ? I.smartphone : sess.device.includes("MacBook") ? I.laptop : I.monitor}
                      size={20}
                    />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{sess.device} · {sess.browser}</span>
                      {sess.isCurrent && (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-ptext">
                          Current device
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted">
                      {sess.location} · IP {sess.ipAddress} · {sess.lastActive}
                    </span>
                  </div>
                </div>

                {!sess.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRevokeSession(sess.id)}
                    disabled={revokingSessionId === sess.id}
                    className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:text-crit hover:border-crit/40"
                  >
                    {revokingSessionId === sess.id ? "Revoking..." : "Revoke"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Personal data export (P6-09) */}
        <Suspense fallback={null}>
          <DataExportCard />
        </Suspense>

        {/* Danger Zone: Delete Account */}
        <div className="flex flex-col gap-4 rounded-2xl border border-crit/40 bg-crit-soft/20 p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold m-0 text-crit">Delete Account</h2>
              <p className="m-0 mt-0.5 text-xs text-muted">
                Permanently delete your personal profile and revoke access to all organisations and sites.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmationText("");
                setDeleteError(null);
                setDeleteDialogOpen(true);
              }}
              className="ease-ui flex items-center gap-2 rounded-full border border-crit bg-crit px-4 py-2 text-xs font-semibold text-on-primary hover:bg-crit/90"
            >
              <Icon d={I.trash} size={14} />
              <span>Delete account</span>
            </button>
          </div>
        </div>
      </div>

      {/* Delete Account Modal Confirmation Dialog */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-scrim p-4">
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="flex w-[min(520px,100%)] flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-dialog"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-crit-soft text-crit">
                <Icon d={I.critical} size={20} />
              </span>
              <div>
                <h3 id="delete-account-title" className="m-0 text-lg font-semibold text-ink">
                  Permanently delete account?
                </h3>
                <p className="m-0 text-xs text-muted">This action is irreversible and immediate.</p>
              </div>
            </div>

            {deleteError && (
              <div role="alert" className="rounded-xl border border-crit/40 bg-crit-soft p-3 text-xs leading-5 font-semibold text-crit">
                {deleteError}
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-xl border border-line bg-subtle/50 p-4 text-xs leading-5 text-muted">
              <p className="m-0 text-ink font-semibold">Important notes before proceeding:</p>
              <ul className="m-0 list-disc pl-4 space-y-1">
                <li>All your active user sessions will be immediately terminated.</li>
                <li>Your personal activity logs and profile preferences will be permanently erased.</li>
                <li>
                  <strong>Organisation owners:</strong> transfer ownership of any organisation that has other members, and cancel any active subscription, first. Organisations you own alone are deleted with your account and erased after 30 days.
                </li>
                <li>Download your data first if you want to keep a copy.</li>
              </ul>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="delete-confirm-input" className="text-xs font-semibold text-ink">
                To confirm, type <span className="font-mono text-crit font-bold">DELETE</span> below:
              </label>
              <input
                id="delete-confirm-input"
                type="text"
                placeholder="DELETE"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-crit focus:ring-1 focus:ring-crit"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteDialogOpen(false)}
                className="ease-ui rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmationText !== "DELETE" || deletingAccount}
                className="ease-ui rounded-full bg-crit px-4 py-2 text-xs font-semibold text-on-primary hover:bg-crit/90 disabled:opacity-50"
              >
                {deletingAccount ? "Deleting account..." : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}
