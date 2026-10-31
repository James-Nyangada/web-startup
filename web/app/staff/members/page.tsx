"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate, input, td, th, useStaffSession } from "@/components/staff/staff-shell";
import { staffApi, type StaffInvitation, type StaffMember, type StaffRole } from "@/lib/admin-api";
import { Icon, I } from "@/components/icons";

const ROLE_COLORS: Record<StaffRole, string> = {
  owner: "bg-crit-soft text-crit border-crit/20",
  admin: "bg-primary-soft text-ptext border-primary/20",
  editor: "bg-ser-soft text-ser border-ser/20",
  support: "bg-ok-soft text-ok border-ok/20",
  analyst: "bg-subtle text-ink border-line",
};

const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  owner: "Full administrative authority, legal document publishing, staff permissions, and destructive org operations.",
  admin: "Operational administration: customer management, billing overrides, site settings, and feature flags.",
  editor: "Content marketing: author and publish blog posts, fix guides, changelog, site copy, and media assets.",
  support: "Customer service: view orgs, send support emails, review timelines, and request impersonation sessions.",
  analyst: "Read-only access: revenue analytics, conversion funnels, website traffic, and CSV data exports.",
};

const ROLES: StaffRole[] = ["owner", "admin", "editor", "support", "analyst"];

export default function StaffMembersPage() {
  const { session } = useStaffSession();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [editingMember, setEditingMember] = useState<Partial<StaffMember> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [data, pending] = await Promise.all([
        staffApi.listMembers(),
        staffApi.listMemberInvitations(),
      ]);
      setMembers(data);
      setInvitations(pending);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeOwnersCount = members.filter((m) => m.role === "owner" && m.active).length;

  const handleOpenNew = () => {
    setIsNew(true);
    setEditingMember({
      userId: "",
      email: "",
      role: "editor",
      displayName: "",
      jobTitle: "",
      bio: "",
      active: true,
    });
    setErrorMsg(null);
    setNotice(null);
  };

  const handleOpenEdit = (m: StaffMember) => {
    setIsNew(false);
    setEditingMember({ ...m });
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    if (isNew && !editingMember.email?.trim()) {
      setErrorMsg("Email address is required.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      if (isNew) {
        const email = editingMember.email!.trim();
        await staffApi.inviteMember({
          email,
          role: editingMember.role as StaffRole,
          displayName: editingMember.displayName?.trim() || undefined,
          jobTitle: editingMember.jobTitle?.trim() || undefined,
          bio: editingMember.bio?.trim() || undefined,
        });
        setNotice(`Invitation sent to ${email}.`);
      } else if (editingMember.id) {
        await staffApi.updateMember(editingMember.id, {
          role: editingMember.role,
          displayName: editingMember.displayName?.trim() || undefined,
          jobTitle: editingMember.jobTitle?.trim() || undefined,
          bio: editingMember.bio?.trim() || undefined,
          active: editingMember.active,
        });
      }

      setEditingMember(null);
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save staff member.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (member: StaffMember) => {
    if (member.role === "owner" && activeOwnersCount <= 1) {
      alert("Cannot delete or remove the last active Owner on the platform.");
      return;
    }
    if (!confirm(`Are you sure you want to remove staff access for ${member.displayName || member.userId}?`)) {
      return;
    }
    try {
      await staffApi.deleteMember(member.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete staff member.");
    }
  };

  const handleResend = async (inv: StaffInvitation) => {
    try {
      await staffApi.resendMemberInvitation(inv.id);
      setNotice(`Invitation re-sent to ${inv.email}.`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resend invitation.");
    }
  };

  const handleRevoke = async (inv: StaffInvitation) => {
    if (!confirm(`Revoke the invitation for ${inv.email}?`)) return;
    try {
      await staffApi.revokeMemberInvitation(inv.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke invitation.");
    }
  };

  return (
    <StaffShell
      title="Staff &amp; Roles"
      actions={
        <button type="button" className={btn.primary} onClick={handleOpenNew}>
          <Icon d={I.plus} size={16} />
          Invite staff member
        </button>
      }
    >
      {notice && (
        <div role="status" className="mb-4 rounded-xl border border-ok/30 bg-ok-soft p-3 text-xs text-ok">
          {notice}
        </div>
      )}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-sm text-muted">
          Staff member authentication, roles, and granular permissions. Two-factor TOTP authentication
          is enforced for all staff sessions. Exactly one active Owner is preserved at all times.
        </p>
      </div>

      {/* Role explanation cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border border-line bg-surface p-3.5 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`size-2 rounded-full ${r === "owner" ? "bg-crit" : r === "admin" ? "bg-primary" : "bg-ok"}`} />
              <span className="font-bold text-xs uppercase tracking-wider capitalize text-ink">{r}</span>
            </div>
            <p className="text-[11px] text-muted m-0 line-clamp-3">
              {ROLE_DESCRIPTIONS[r]}
            </p>
          </div>
        ))}
      </div>

      {/* Members table */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full border-collapse">
          <caption className="sr-only">Staff members directory</caption>
          <thead className="border-b border-line bg-subtle">
            <tr>
              <th scope="col" className={th}>Staff Member</th>
              <th scope="col" className={th}>Role</th>
              <th scope="col" className={th}>Job Title</th>
              <th scope="col" className={th}>Active Status</th>
              <th scope="col" className={th}>Added</th>
              <th scope="col" className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {members.map((m) => {
              const isCurrentUser = m.email === session?.email || m.id === session?.staffMemberId;
              const isLastOwner = m.role === "owner" && activeOwnersCount <= 1;

              return (
                <tr key={m.id} className="hover:bg-subtle/50">
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-bold text-ptext">
                        {(m.displayName || m.userId).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-ink flex items-center gap-1.5">
                          <span>{m.displayName || "Staff user"}</span>
                          {isCurrentUser && (
                            <span className="rounded bg-subtle px-1.5 py-0.2 text-[10px] text-muted font-normal">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted font-mono">{m.email || m.userId}</div>
                      </div>
                    </div>
                  </td>
                  <td className={td}>
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
                        ROLE_COLORS[m.role] || "bg-subtle text-muted"
                      }`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className={`${td} text-xs text-muted`}>
                    {m.jobTitle || "-"}
                  </td>
                  <td className={td}>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        m.active ? "text-ok bg-ok-soft" : "text-muted bg-subtle"
                      }`}
                    >
                      <span className={`size-1.5 rounded-full ${m.active ? "bg-ok" : "bg-muted"}`} />
                      {m.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className={`${td} text-xs text-muted whitespace-nowrap`}>
                    {formatDate(m.createdAt)}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-ink hover:bg-subtle"
                        onClick={() => handleOpenEdit(m)}
                        title="Edit staff member"
                      >
                        <Icon d={I.pencil} size={15} />
                      </button>
                      <button
                        type="button"
                        disabled={isLastOwner}
                        className={`rounded p-1 ${
                          isLastOwner
                            ? "opacity-30 cursor-not-allowed text-muted"
                            : "text-crit/70 hover:text-crit hover:bg-crit-soft"
                        }`}
                        onClick={() => void handleDelete(m)}
                        title={isLastOwner ? "Cannot remove the only active Owner" : "Remove staff access"}
                      >
                        <Icon d={I.trash} size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {state === "ready" && members.length === 0 && (
          <p className="m-0 p-8 text-center text-sm text-muted">
            No staff members found.
          </p>
        )}
      </div>

      {invitations.length > 0 && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <h2 className="m-0 border-b border-line bg-subtle px-4 py-3 text-sm font-bold text-ink">
            Pending invitations
          </h2>
          <ul className="m-0 list-none divide-y divide-line p-0">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-ink">{inv.displayName || inv.email}</div>
                  <div className="text-xs text-muted">
                    {inv.email} · <span className="capitalize">{inv.role}</span> · expires {formatDate(inv.expiresAt)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={btn.secondary}
                    onClick={() => void handleResend(inv)}
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    className={btn.secondary}
                    onClick={() => void handleRevoke(inv)}
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Member Modal */}
      {editingMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl my-8">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h2 id="member-modal-title" className="m-0 text-lg font-bold text-ink">
                {isNew ? "Invite staff member" : "Edit staff member"}
              </h2>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="rounded p-1 text-muted hover:text-ink"
                aria-label="Close"
              >
                <Icon d={I.x} size={18} />
              </button>
            </div>

            {errorMsg && (
              <div role="alert" className="mb-4 rounded-xl border border-crit/30 bg-crit-soft p-3 text-xs text-crit">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {isNew ? (
                <div>
                  <label htmlFor="member-email" className="mb-1 block text-xs font-semibold text-muted">
                    Email address
                  </label>
                  <input
                    id="member-email"
                    type="email"
                    required
                    placeholder="e.g. jane@company.com"
                    value={editingMember.email || ""}
                    onChange={(e) => setEditingMember({ ...editingMember, email: e.target.value })}
                    className={input}
                  />
                  <p className="mt-1 text-xs text-muted">
                    We will email an invitation link. They create their account and open the staff portal from it.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-subtle p-3 text-xs text-muted">
                  <span className="font-semibold text-ink block">Account: {editingMember.email || editingMember.displayName}</span>
                  <span className="font-mono text-[10px] block mt-0.5">{editingMember.userId}</span>
                </div>
              )}

              <div>
                <label htmlFor="member-role" className="mb-1 block text-xs font-semibold text-muted">
                  Staff Role
                </label>
                <select
                  id="member-role"
                  value={editingMember.role || "editor"}
                  onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value as StaffRole })}
                  className={input}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.toUpperCase()} — {ROLE_DESCRIPTIONS[r].slice(0, 50)}…
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="member-name" className="mb-1 block text-xs font-semibold text-muted">
                  Display Name
                </label>
                <input
                  id="member-name"
                  type="text"
                  placeholder="e.g. Jane Doe"
                  value={editingMember.displayName || ""}
                  onChange={(e) => setEditingMember({ ...editingMember, displayName: e.target.value })}
                  className={input}
                />
              </div>

              <div>
                <label htmlFor="member-title" className="mb-1 block text-xs font-semibold text-muted">
                  Job Title
                </label>
                <input
                  id="member-title"
                  type="text"
                  placeholder="e.g. Head of Accessibility"
                  value={editingMember.jobTitle || ""}
                  onChange={(e) => setEditingMember({ ...editingMember, jobTitle: e.target.value })}
                  className={input}
                />
              </div>

              <div>
                <label htmlFor="member-bio" className="mb-1 block text-xs font-semibold text-muted">
                  Bio / Author Credentials
                </label>
                <textarea
                  id="member-bio"
                  rows={3}
                  placeholder="Public bio displayed on blog posts and fix guides authored by this staff member..."
                  value={editingMember.bio || ""}
                  onChange={(e) => setEditingMember({ ...editingMember, bio: e.target.value })}
                  className={input}
                />
              </div>

              {!isNew && (
                <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={editingMember.active ?? true}
                    onChange={(e) => setEditingMember({ ...editingMember, active: e.target.checked })}
                    className="size-4 rounded text-primary focus:ring-primary"
                  />
                  <span>Active staff member</span>
                </label>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setEditingMember(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className={btn.primary} disabled={saving}>
                  {saving ? "Saving…" : isNew ? "Send invitation" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </StaffShell>
  );
}
