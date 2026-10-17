"use client";

import React, { useState } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  initials: string;
  lastActive: string;
}

const MEMBERS: MemberRow[] = [
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

export default function MembersSettingsPage() {
  const { showToast } = useToast();
  const [members, setMembers] = useState<MemberRow[]>(MEMBERS);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    showToast(`Invitation sent to ${inviteEmail} as ${inviteRole}.`);
    setInviteEmail("");
    setInviteModalOpen(false);
  };

  const handleRoleChange = (memberId: string, newRole: "admin" | "member") => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
    showToast("Member role updated.");
  };

  return (
    <SettingsLayout
      title="Team Members"
      description="Manage who has access to this organisation and their permissions."
    >
      <div className="flex flex-col gap-6 max-w-4xl">
        {/* Header & Invite CTA */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-sm font-semibold text-ink">3 of 5 seats used</span>
            <span className="text-xs text-muted block">Agency Plan allows up to 5 teammates</span>
          </div>
          <button
            type="button"
            onClick={() => setInviteModalOpen(true)}
            className="ease-ui flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            <Icon d={I.plus} size={16} />
            <span>Invite member</span>
          </button>
        </div>

        {/* Members Table */}
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
                    <td className="px-4 py-3 sm:px-6">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 place-items-center rounded-full border border-line bg-sunk text-xs font-bold flex-none">
                          {m.initials}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-ink truncate">{m.name}</span>
                          <span className="text-xs text-muted truncate">{m.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.role === "owner" ? (
                        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-ptext">
                          Owner
                        </span>
                      ) : (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value as "admin" | "member")}
                          aria-label={`Change role for ${m.name}`}
                          className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted hidden sm:table-cell">
                      {m.lastActive}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.role !== "owner" && (
                        <button
                          type="button"
                          onClick={() => {
                            setMembers((prev) => prev.filter((x) => x.id !== m.id));
                            showToast(`Removed ${m.name} from organisation.`);
                          }}
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
                  <label htmlFor="inviteEmail" className="text-sm font-medium">
                    Email address
                  </label>
                  <input
                    id="inviteEmail"
                    type="email"
                    required
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="inviteRole" className="text-sm font-medium">
                    Role
                  </label>
                  <select
                    id="inviteRole"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                    className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="member">Member — Can triage issues and generate reports</option>
                    <option value="admin">Admin — Can add sites, invite members, and edit settings</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ease-ui rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
                  >
                    Send invitation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
