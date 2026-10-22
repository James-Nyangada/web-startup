"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { DataExportCard } from "@/components/settings/data-export-card";
import { useToast } from "@/components/shell/toast-context";
import { Icon, I } from "@/components/icons";
import { ThemePreferenceRadio } from "@/components/theme";
import { useFocusTrap } from "@/components/use-focus-trap";
import { TimeZoneCombobox } from "@/components/settings/time-zone-combobox";
import { authClient, type ActiveSession, type User, ApiException } from "@/lib/auth-client";
import { describeUserAgent } from "@/lib/user-agent";

function lastActiveLabel(sess: ActiveSession): string {
  if (sess.isCurrent) return "Active now";
  const mins = Math.round((Date.now() - new Date(sess.lastActiveAt).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (mins < 60) return mins < 2 ? "Active just now" : `Active ${rtf.format(-mins, "minute")}`;
  if (mins < 60 * 24) return `Active ${rtf.format(-Math.round(mins / 60), "hour")}`;
  return `Active ${rtf.format(-Math.round(mins / (60 * 24)), "day")}`;
}

/** Centre-crops an image to a 256 × 256 WebP data URL, small enough for the API's body limit. */
async function resizeAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.9);
}

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

  // Avatar upload state
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

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
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
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
    authClient
      .listSessions()
      .then((res) => mounted && setSessions(res.sessions))
      .catch(() => mounted && setSessionsError(true));
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

  // Handle Avatar Update: resized to 256 × 256 in the browser, then stored by the API.
  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      showToast("Choose a PNG, JPEG or WebP image.", { type: "error" });
      return;
    }
    setAvatarBusy(true);
    try {
      const res = await authClient.uploadAvatar(await resizeAvatar(file));
      setAvatarUrl(res.user.avatarUrl || "");
      showToast("Profile picture updated.");
    } catch (err: any) {
      showToast(err.message || "Failed to upload profile picture.", { type: "error" });
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleClearAvatar = async () => {
    setAvatarBusy(true);
    try {
      await authClient.removeAvatar();
      setAvatarUrl("");
      showToast("Avatar reset to your initials.");
    } catch (err: any) {
      showToast(err.message || "Failed to remove profile picture.", { type: "error" });
    } finally {
      setAvatarBusy(false);
    }
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
      setSessions((prev) => prev?.filter((s) => s.id !== sessionId) ?? null);
      showToast("Session revoked. That device is now signed out.");
    } catch (err) {
      showToast(err instanceof ApiException ? err.message : "Could not revoke that session.", { type: "error" });
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    const others = sessions?.filter((s) => !s.isCurrent) ?? [];
    setRevokingSessionId("all");
    const results = await Promise.allSettled(others.map((s) => authClient.revokeSession(s.id)));
    const revoked = new Set(others.filter((_, i) => results[i]?.status === "fulfilled").map((s) => s.id));
    setSessions((prev) => prev?.filter((s) => !revoked.has(s.id)) ?? null);
    setRevokingSessionId(null);
    if (revoked.size === others.length) showToast("All other sessions have been signed out.");
    else showToast(`Signed out ${revoked.size} of ${others.length} sessions. Try again for the rest.`, { type: "error" });
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
      description="Manage your personal details, appearance, security preferences, and active sessions."
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
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleAvatarFile}
                  className="sr-only"
                  aria-label="Upload profile picture"
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-subtle disabled:opacity-50"
                >
                  {avatarBusy ? "Uploading…" : avatarUrl ? "Change picture" : "Upload picture"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleClearAvatar}
                    disabled={avatarBusy}
                    className="ease-ui rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:text-crit hover:border-crit/40 disabled:opacity-50"
                  >
                    Reset to initials
                  </button>
                )}
              </div>
              <span className="text-xs text-muted">PNG, JPEG or WebP. Cropped to a square.</span>
            </div>
          </div>

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
            <TimeZoneCombobox
              id="timezone-select"
              value={timeZone}
              onChange={setTimeZone}
              describedBy="timezone-help"
            />
            <span id="timezone-help" className="text-xs text-muted">
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
            {sessions && sessions.length > 1 && (
              <button
                type="button"
                onClick={handleRevokeAllOtherSessions}
                disabled={revokingSessionId === "all"}
                className="ease-ui rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-crit hover:bg-crit-soft hover:border-crit/40"
              >
                {revokingSessionId === "all" ? "Revoking..." : "Revoke all other sessions"}
              </button>
            )}
          </div>

          <div className="divide-y divide-line">
            {sessionsError && (
              <p role="alert" className="m-0 py-3.5 text-xs text-crit">
                Could not load your sessions. Refresh the page to try again.
              </p>
            )}
            {!sessions && !sessionsError && (
              <p role="status" className="m-0 py-3.5 text-xs text-muted">
                Loading sessions…
              </p>
            )}
            {sessions?.map((sess) => {
              const ua = describeUserAgent(sess.userAgent);
              return (
              <div key={sess.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                <div className="flex items-center gap-3.5">
                  <div className="grid size-10 place-items-center rounded-xl border border-line bg-subtle text-ink">
                    <Icon
                      d={ua.kind === "desktop" ? (ua.device === "Mac" || ua.device === "Chromebook" ? I.laptop : I.monitor) : I.smartphone}
                      size={20}
                    />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{ua.device} · {ua.browser}</span>
                      {sess.isCurrent && (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-ptext">
                          Current device
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted">
                      {sess.ipAddress ? `IP ${sess.ipAddress} · ` : ""}
                      {lastActiveLabel(sess)}
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
              );
            })}
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
