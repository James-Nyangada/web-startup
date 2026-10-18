"use client";

import React, { useState, useEffect, useCallback } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import { apiClient } from "@/lib/api";

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  initials: string;
  lastActive: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: "admin" | "member" | "client_viewer";
  expiresAt: string;
  createdAt: string;
  invitedByName?: string | null;
}

const DEFAULT_MEMBERS: MemberRow[] = [
  {
    id: "m-1",
    name: "Daniel Mwangi",
    email: "daniel@brightline.studio",
    role: "owner",
    initials: "DM",
    lastActive: "Just now",
  },
  {
    id: "m-2",
    name: "Aisha Kamau",
    email: "aisha@brightline.studio",
    role: "admin",
    initials: "AK",
    lastActive: "2 hours ago",
  },
  {
    id: "m-3",
    name: "Mark Otieno",
    email: "mark@brightline.studio",
    role: "member",
    initials: "MO",
    lastActive: "Yesterday",
  },
];

const DEFAULT_INVITATIONS: PendingInvitation[] = [
  {
    id: "inv-demo-1",
    email: "sarah.dev@brightline.studio",
    role: "member",
    expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    invitedByName: "Daniel Mwangi",
  },
];

export default function MembersSettingsPage() {
  const { showToast } = useToast();
  const [members, setMembers] = useState<MemberRow[]>(DEFAULT_MEMBERS);
  const [invitations, setInvitations] = useState<PendingInvitation[]>(DEFAULT_INVITATIONS);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberRow | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const orgSlug = "brightline";

  const fetchMembers = useCallback(async () => {
    try {
      const res = await apiClient<{ members: any[]; invitations: any[] }>(
        `/v1/orgs/${orgSlug}/members`,
      );
      if (res?.members && res.members.length > 0) {
        setMembers(
          res.members.map((m) => {
            const name = m.name || m.email.split("@")[0] || "User";
            const initials = name
              .split(" ")
              .map((part: string) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return {
              id: m.userId || m.id,
              name,
              email: m.email,
              role: m.role || "member",
              initials,
              lastActive: "Active today",
            };
          }),
        );
      }
      if (res?.invitations) {
        setInvitations(res.invitations);
      }
    } catch {
      // Fallback to demo data
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    setIsInviting(true);
    try {
      await apiClient(`/v1/orgs/${orgSlug}/invitations`, {
        method: "POST",
        body: JSON.stringify({
          email,
          role: inviteRole,
        }),
      });

      // Add to pending invitations state
      const newInv: PendingInvitation = {
        id: `inv-${Date.now()}`,
        email,
        role: inviteRole,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        invitedByName: "You",
      };
      setInvitations((prev) => [newInv, ...prev]);

      showToast(`Invitation sent to ${email} as ${inviteRole}.`);
      setInviteEmail("");
      setInviteModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send invitation";
      showToast(`Error: ${msg}`);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: "admin" | "member") => {
    const previousRole = members.find((m) => m.id === memberId)?.role;
    // Optimistic update
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
    );

    try {
      await apiClient(`/v1/orgs/${orgSlug}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      showToast(`Role updated to ${newRole}.`);
    } catch (err: unknown) {
      if (previousRole) {
        setMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, role: previousRole } : m)),
        );
      }
      const msg = err instanceof Error ? err.message : "Failed to update role";
      showToast(`Error: ${msg}`);
    }
  };

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return;
    setIsRemoving(true);

    try {
      await apiClient(`/v1/orgs/${orgSlug}/members/${memberToRemove.id}`, {
        method: "DELETE",
      });
      setMembers((prev) => prev.filter((x) => x.id !== memberToRemove.id));
      showToast(`Removed ${memberToRemove.name} from organisation.`);
      setMemberToRemove(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove member";
      showToast(`Error: ${msg}`);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string, email: string) => {
    try {
      await apiClient(`/v1/orgs/${orgSlug}/invitations/${invitationId}`, {
        method: "DELETE",
      });
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      showToast(`Revoked invitation for ${email}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke invitation";
      showToast(`Error: ${msg}`);
    }
  };

  const handleResendInvitation = async (invitationId: string, email: string) => {
    try {
      await apiClient(`/v1/orgs/${orgSlug}/invitations/${invitationId}/resend`, {
        method: "POST",
      });
      showToast(`Resent invitation email to ${email} (valid for 7 days).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend invitation";
      showToast(`Error: ${msg}`);
    }
  };

  const formatExpiryDays = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    const days = Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
    return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
  };

  return (
    <SettingsLayout
      title="Team Members"
      description="Manage who has access to this organisation and their permissions."
    >
      <div className="flex flex-col gap-8 max-w-4xl">
        {/* Header & Seat Meter & Invite CTA */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-sm font-semibold text-ink">
              {members.length} of 5 seats used
            </span>
            <span className="text-xs text-muted block">
              Agency Plan allows up to 5 team members. Need more? Upgrade in Billing.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setInviteModalOpen(true)}
            className="ease-ui flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-xs"
          >
            <Icon d={I.plus} size={16} />
            <span>Invite member</span>
          </button>
        </div>

        {/* Section 1: Active Members Table */}
        <div className="flex flex-col gap-3">
          <h2 className="m-0 text-base font-semibold text-ink">Active Members</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-ink border-collapse">
                <thead>
                  <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                    <th scope="col" className="px-4 py-3 sm:px-6">Member</th>
                    <th scope="col" className="px-4 py-3">Role</th>
                    <th scope="col" className="px-4 py-3 hidden sm:table-cell">Last Active</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-subtle/50 transition-colors">
                      <td className="px-4 py-3.5 sm:px-6">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 place-items-center rounded-full border border-line bg-sunk text-xs font-bold flex-none text-ink">
                            {m.initials}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-ink truncate">{m.name}</span>
                            <span className="text-xs text-muted truncate">{m.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {m.role === "owner" ? (
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            Owner
                          </span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) =>
                              handleRoleChange(m.id, e.target.value as "admin" | "member")
                            }
                            aria-label={`Change role for ${m.name}`}
                            className="rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink outline-none focus:border-primary"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted hidden sm:table-cell">
                        {m.lastActive}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {m.role !== "owner" && (
                          <button
                            type="button"
                            onClick={() => setMemberToRemove(m)}
                            aria-label={`Remove ${m.name}`}
                            className="text-xs font-medium text-crit hover:underline border-0 bg-transparent cursor-pointer p-0"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Section 2: Pending Invitations Table */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-base font-semibold text-ink">Pending Invitations</h2>
            <span className="text-xs text-muted">
              Tokens expire after 7 days and can only be used once.
            </span>
          </div>

          {invitations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
              No pending invitations. Click &ldquo;Invite member&rdquo; to add teammates.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-ink border-collapse">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                      <th scope="col" className="px-4 py-3 sm:px-6">Invitee</th>
                      <th scope="col" className="px-4 py-3">Assigned Role</th>
                      <th scope="col" className="px-4 py-3 hidden sm:table-cell">Expires</th>
                      <th scope="col" className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {invitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-subtle/50 transition-colors">
                        <td className="px-4 py-3.5 sm:px-6">
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-ink truncate">{inv.email}</span>
                            {inv.invitedByName && (
                              <span className="text-xs text-muted truncate">
                                Invited by {inv.invitedByName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-ink capitalize">
                            {inv.role.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted hidden sm:table-cell">
                          {formatExpiryDays(inv.expiresAt)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="inline-flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => handleResendInvitation(inv.id, inv.email)}
                              className="text-xs font-medium text-primary hover:underline border-0 bg-transparent cursor-pointer p-0"
                            >
                              Resend
                            </button>
                            <span className="text-line-strong">·</span>
                            <button
                              type="button"
                              onClick={() => handleRevokeInvitation(inv.id, inv.email)}
                              className="text-xs font-medium text-crit hover:underline border-0 bg-transparent cursor-pointer p-0"
                            >
                              Revoke
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Invite Member Modal */}
        {inviteModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Invite team member"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-xs"
          >
            <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-dialog text-ink">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <h3 className="text-base font-semibold m-0">Invite team member</h3>
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  aria-label="Close dialog"
                  className="grid size-8 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-subtle"
                >
                  <Icon d={I.close} size={16} />
                </button>
              </div>

              <form onSubmit={handleInvite} className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="inviteEmail" className="text-sm font-semibold text-ink">
                    Email address
                  </label>
                  <input
                    id="inviteEmail"
                    type="email"
                    required
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-xs text-muted">
                    We will send an invitation email (E-04) with a single-use 7-day link.
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="inviteRole" className="text-sm font-semibold text-ink">
                    Role &amp; Permissions
                  </label>
                  <select
                    id="inviteRole"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                    className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="member">Member — Can triage issues, recheck, and download reports</option>
                    <option value="admin">Admin — Can add sites, invite members, and configure settings</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-line mt-2">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    className="ease-ui rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isInviting || !inviteEmail.trim()}
                    className="ease-ui rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    {isInviting ? "Sending invite..." : "Send invitation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Remove Member Confirmation Dialog */}
        {memberToRemove && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm member removal"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-xs"
          >
            <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-dialog text-ink">
              <h3 className="text-base font-semibold m-0 text-crit">Remove team member?</h3>
              <p className="mt-2 text-sm text-muted">
                Are you sure you want to remove <strong>{memberToRemove.name}</strong> ({memberToRemove.email})
                from this organisation? They will immediately lose access to all sites, audits, and reports.
              </p>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line mt-4">
                <button
                  type="button"
                  onClick={() => setMemberToRemove(null)}
                  className="ease-ui rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRemoveMember}
                  disabled={isRemoving}
                  className="ease-ui rounded-full bg-crit px-5 py-2 text-sm font-semibold text-white hover:bg-crit/90 disabled:opacity-50"
                >
                  {isRemoving ? "Removing..." : "Remove member"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
