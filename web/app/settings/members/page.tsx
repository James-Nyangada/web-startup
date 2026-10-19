"use client";

import React, { useState, useEffect, useCallback } from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";
import { apiClient } from "@/lib/api";
import { appApi, type ApiClientViewer } from "@/lib/app-api";

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
  siteIds?: string[];
  expiresAt: string;
  createdAt: string;
  invitedByName?: string | null;
}

export interface OrgSiteSummary {
  id: string;
  name: string;
  rootUrl: string;
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

const DEFAULT_CLIENTS: ApiClientViewer[] = [
  {
    user: {
      id: "cv-1",
      name: "Helena Rost",
      email: "helena@oakhaus.de",
      avatarUrl: null,
    },
    sites: [
      {
        id: "site-1",
        name: "Oakhaus Living",
        rootUrl: "https://oakhaus.de",
        status: "active",
        platform: "shopify",
      },
    ],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const DEFAULT_SITES: OrgSiteSummary[] = [
  { id: "site-1", name: "Oakhaus Living", rootUrl: "https://oakhaus.de" },
  { id: "site-2", name: "Fjord Apparel", rootUrl: "https://fjord.co" },
  { id: "site-3", name: "Sørensen Law", rootUrl: "https://sorensen.dk" },
];

export default function MembersSettingsPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"team" | "clients">("team");

  // Team state
  const [members, setMembers] = useState<MemberRow[]>(DEFAULT_MEMBERS);
  const [invitations, setInvitations] = useState<PendingInvitation[]>(DEFAULT_INVITATIONS);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberRow | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Client viewers state (S-42)
  const [clients, setClients] = useState<ApiClientViewer[]>(DEFAULT_CLIENTS);
  const [orgSites, setOrgSites] = useState<OrgSiteSummary[]>(DEFAULT_SITES);
  const [inviteClientModalOpen, setInviteClientModalOpen] = useState(false);
  const [inviteClientEmail, setInviteClientEmail] = useState("");
  const [inviteClientSiteIds, setInviteClientSiteIds] = useState<string[]>([]);
  const [clientToEdit, setClientToEdit] = useState<ApiClientViewer | null>(null);
  const [editClientSiteIds, setEditClientSiteIds] = useState<string[]>([]);
  const [isUpdatingSites, setIsUpdatingSites] = useState(false);
  const [clientToRemove, setClientToRemove] = useState<ApiClientViewer | null>(null);
  const [isRemovingClient, setIsRemovingClient] = useState(false);

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

  const fetchSites = useCallback(async () => {
    try {
      const res = await apiClient<{ sites: any[] }>(`/v1/orgs/${orgSlug}/sites`);
      if (res?.sites && res.sites.length > 0) {
        setOrgSites(
          res.sites.map((s) => ({
            id: s.id,
            name: s.name,
            rootUrl: s.rootUrl,
          })),
        );
      }
    } catch {
      // Fallback
    }
  }, [orgSlug]);

  const fetchClients = useCallback(async () => {
    try {
      const clientsList = await appApi.listClients(orgSlug);
      if (clientsList) {
        setClients(clientsList);
      }
    } catch {
      // Fallback
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchMembers();
    fetchSites();
    fetchClients();
  }, [fetchMembers, fetchSites, fetchClients]);

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

  const handleInviteClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteClientEmail.trim().toLowerCase();
    if (!email) return;
    if (inviteClientSiteIds.length === 0) {
      showToast("Please select at least one site for the client viewer.");
      return;
    }

    setIsInviting(true);
    try {
      await apiClient(`/v1/orgs/${orgSlug}/invitations`, {
        method: "POST",
        body: JSON.stringify({
          email,
          role: "client_viewer",
          siteIds: inviteClientSiteIds,
        }),
      });

      const newInv: PendingInvitation = {
        id: `inv-cv-${Date.now()}`,
        email,
        role: "client_viewer",
        siteIds: inviteClientSiteIds,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        invitedByName: "You",
      };
      setInvitations((prev) => [newInv, ...prev]);

      showToast(`Client viewer invitation sent to ${email}.`);
      setInviteClientEmail("");
      setInviteClientSiteIds([]);
      setInviteClientModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send client invitation";
      showToast(`Error: ${msg}`);
    } finally {
      setIsInviting(false);
    }
  };

  const handleSaveClientSites = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientToEdit) return;
    if (editClientSiteIds.length === 0) {
      showToast("Client viewer must be assigned to at least one site.");
      return;
    }

    setIsUpdatingSites(true);
    try {
      await appApi.setClientSites(orgSlug, clientToEdit.user.id, editClientSiteIds);

      // Optimistically update clients list
      setClients((prev) =>
        prev.map((c) => {
          if (c.user.id !== clientToEdit.user.id) return c;
          const assigned = orgSites
            .filter((s) => editClientSiteIds.includes(s.id))
            .map((s) => ({
              id: s.id,
              name: s.name,
              rootUrl: s.rootUrl,
              status: "active",
              platform: "custom",
            }));
          return { ...c, sites: assigned };
        }),
      );

      showToast(`Site access updated for ${clientToEdit.user.name || clientToEdit.user.email}.`);
      setClientToEdit(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update site access";
      showToast(`Error: ${msg}`);
    } finally {
      setIsUpdatingSites(false);
    }
  };

  const confirmRemoveClient = async () => {
    if (!clientToRemove) return;
    setIsRemovingClient(true);

    try {
      await appApi.removeClient(orgSlug, clientToRemove.user.id);
      setClients((prev) => prev.filter((c) => c.user.id !== clientToRemove.user.id));
      showToast(
        `Removed client viewer ${clientToRemove.user.name || clientToRemove.user.email}.`,
      );
      setClientToRemove(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove client viewer";
      showToast(`Error: ${msg}`);
    } finally {
      setIsRemovingClient(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: "admin" | "member") => {
    const previousRole = members.find((m) => m.id === memberId)?.role;
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

  const teamInvitations = invitations.filter((i) => i.role !== "client_viewer");
  const clientInvitations = invitations.filter((i) => i.role === "client_viewer");

  return (
    <SettingsLayout
      title="Team & Client Access"
      description="Manage internal team members and external client viewers."
    >
      <div className="flex flex-col gap-8 max-w-4xl">
        {/* Navigation Tabs (S-42) */}
        <div
          role="tablist"
          aria-label="Access management tabs"
          className="flex items-center gap-2 border-b border-line pb-px"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "team"}
            onClick={() => setActiveTab("team")}
            className={`ease-ui relative px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === "team"
                ? "text-primary border-b-2 border-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            Team Members
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "clients"}
            onClick={() => setActiveTab("clients")}
            className={`ease-ui relative px-4 py-2.5 text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeTab === "clients"
                ? "text-primary border-b-2 border-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            <span>Client Viewers (S-42)</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-bold">
              Agency
            </span>
          </button>
        </div>

        {activeTab === "team" ? (
          <>
            {/* Header & Seat Meter & Invite CTA */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-sm font-semibold text-ink">
                  {members.length} of 10 seats used
                </span>
                <span className="text-xs text-muted block">
                  Agency Plan allows up to 10 team members. Need more? Upgrade to Agency Pro.
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
                <h2 className="m-0 text-base font-semibold text-ink">Pending Team Invitations</h2>
                <span className="text-xs text-muted">
                  Tokens expire after 7 days and can only be used once.
                </span>
              </div>

              {teamInvitations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                  No pending team invitations.
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
                        {teamInvitations.map((inv) => (
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
          </>
        ) : (
          /* Client Viewers Tab (S-42) */
          <>
            {/* Header & Feature Explanation */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-sm font-semibold text-ink">
                  {clients.length} Client {clients.length === 1 ? "Viewer" : "Viewers"} Active
                </span>
                <span className="text-xs text-muted block">
                  Agency plans feature unlimited client viewers. Each client viewer can only access their explicitly assigned sites in the branded client portal.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInviteClientEmail("");
                  setInviteClientSiteIds(orgSites.length > 0 ? [orgSites[0].id] : []);
                  setInviteClientModalOpen(true);
                }}
                className="ease-ui flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover shadow-xs"
              >
                <Icon d={I.plus} size={16} />
                <span>Invite client viewer</span>
              </button>
            </div>

            {/* Active Client Viewers Table */}
            <div className="flex flex-col gap-3">
              <h2 className="m-0 text-base font-semibold text-ink">Client Viewers (S-42)</h2>
              {clients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                  No client viewers added yet. Click &ldquo;Invite client viewer&rdquo; to grant your clients direct read-only access to their portal.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-ink border-collapse">
                      <thead>
                        <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                          <th scope="col" className="px-4 py-3 sm:px-6">Client User</th>
                          <th scope="col" className="px-4 py-3">Assigned Sites</th>
                          <th scope="col" className="px-4 py-3 hidden sm:table-cell">Added</th>
                          <th scope="col" className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {clients.map((c) => {
                          const displayName = c.user.name || c.user.email.split("@")[0] || "Client";
                          const initials = displayName
                            .split(" ")
                            .map((p) => p[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase();

                          return (
                            <tr key={c.user.id} className="hover:bg-subtle/50 transition-colors">
                              <td className="px-4 py-3.5 sm:px-6">
                                <div className="flex items-center gap-3">
                                  <span className="grid size-9 place-items-center rounded-full border border-line bg-primary/10 text-xs font-bold flex-none text-primary">
                                    {initials}
                                  </span>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-semibold text-ink truncate">
                                      {displayName}
                                    </span>
                                    <span className="text-xs text-muted truncate">
                                      {c.user.email}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="flex flex-wrap gap-1.5 max-w-sm">
                                  {c.sites && c.sites.length > 0 ? (
                                    c.sites.map((s) => (
                                      <span
                                        key={s.id}
                                        className="inline-flex items-center rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-ink border border-line"
                                      >
                                        {s.name}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-crit">No sites assigned</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-xs text-muted hidden sm:table-cell">
                                {new Date(c.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <div className="inline-flex items-center justify-end gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setClientToEdit(c);
                                      setEditClientSiteIds(c.sites.map((s) => s.id));
                                    }}
                                    className="text-xs font-medium text-primary hover:underline border-0 bg-transparent cursor-pointer p-0"
                                  >
                                    Edit site access
                                  </button>
                                  <span className="text-line-strong">·</span>
                                  <button
                                    type="button"
                                    onClick={() => setClientToRemove(c)}
                                    aria-label={`Remove access for ${displayName}`}
                                    className="text-xs font-medium text-crit hover:underline border-0 bg-transparent cursor-pointer p-0"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Pending Client Invitations */}
            {clientInvitations.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="m-0 text-base font-semibold text-ink">
                    Pending Client Invitations
                  </h2>
                  <span className="text-xs text-muted">
                    Tokens expire after 7 days and can only be used once.
                  </span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-ink border-collapse">
                      <thead>
                        <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                          <th scope="col" className="px-4 py-3 sm:px-6">Invitee</th>
                          <th scope="col" className="px-4 py-3">Assigned Sites</th>
                          <th scope="col" className="px-4 py-3 hidden sm:table-cell">Expires</th>
                          <th scope="col" className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {clientInvitations.map((inv) => (
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
                              <span className="text-xs text-muted">
                                {inv.siteIds?.length ?? 1} site(s) assigned
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
              </div>
            )}
          </>
        )}

        {/* Invite Team Member Modal */}
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

        {/* Invite Client Viewer Modal (S-42) */}
        {inviteClientModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Invite client viewer"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-xs"
          >
            <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-dialog text-ink">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div>
                  <h3 className="text-base font-semibold m-0">Invite Client Viewer</h3>
                  <p className="text-xs text-muted mt-0.5 mb-0">
                    Client viewers receive branded email invitations and only see assigned sites.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInviteClientModalOpen(false)}
                  aria-label="Close dialog"
                  className="grid size-8 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-subtle"
                >
                  <Icon d={I.close} size={16} />
                </button>
              </div>

              <form onSubmit={handleInviteClient} className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="clientInviteEmail" className="text-sm font-semibold text-ink">
                    Client email address
                  </label>
                  <input
                    id="clientInviteEmail"
                    type="email"
                    required
                    placeholder="client@clientcompany.com"
                    value={inviteClientEmail}
                    onChange={(e) => setInviteClientEmail(e.target.value)}
                    className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-ink">
                    Assign Sites (Client Isolation Boundary)
                  </label>
                  <p className="text-xs text-muted m-0">
                    Select the websites this client should see. They can never see other sites or organisation settings.
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-line bg-subtle/40 p-3 divide-y divide-line">
                    {orgSites.length === 0 ? (
                      <p className="text-xs text-muted py-2 m-0">No sites available in organisation.</p>
                    ) : (
                      orgSites.map((site) => {
                        const isChecked = inviteClientSiteIds.includes(site.id);
                        return (
                          <label
                            key={site.id}
                            htmlFor={`invite-site-${site.id}`}
                            className="flex items-center gap-3 py-2 cursor-pointer first:pt-0 last:pb-0"
                          >
                            <input
                              id={`invite-site-${site.id}`}
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setInviteClientSiteIds((prev) => [...prev, site.id]);
                                } else {
                                  setInviteClientSiteIds((prev) => prev.filter((id) => id !== site.id));
                                }
                              }}
                              className="size-4 rounded text-primary focus:ring-primary"
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-ink">{site.name}</span>
                              <span className="text-[11px] text-muted">{site.rootUrl}</span>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-line mt-2">
                  <button
                    type="button"
                    onClick={() => setInviteClientModalOpen(false)}
                    className="ease-ui rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isInviting || !inviteClientEmail.trim() || inviteClientSiteIds.length === 0}
                    className="ease-ui rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    {isInviting ? "Sending invite..." : "Send client invite"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Client Sites Modal (S-42) */}
        {clientToEdit && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit client site access"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-xs"
          >
            <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-dialog text-ink">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div>
                  <h3 className="text-base font-semibold m-0">Edit Site Access</h3>
                  <p className="text-xs text-muted mt-0.5 mb-0">
                    Update assigned sites for {clientToEdit.user.name || clientToEdit.user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setClientToEdit(null)}
                  aria-label="Close dialog"
                  className="grid size-8 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-subtle"
                >
                  <Icon d={I.close} size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveClientSites} className="flex flex-col gap-4 mt-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-ink">
                    Assigned Sites
                  </label>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-line bg-subtle/40 p-3 divide-y divide-line">
                    {orgSites.map((site) => {
                      const isChecked = editClientSiteIds.includes(site.id);
                      return (
                        <label
                          key={site.id}
                          htmlFor={`edit-site-${site.id}`}
                          className="flex items-center gap-3 py-2 cursor-pointer first:pt-0 last:pb-0"
                        >
                          <input
                            id={`edit-site-${site.id}`}
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditClientSiteIds((prev) => [...prev, site.id]);
                              } else {
                                setEditClientSiteIds((prev) => prev.filter((id) => id !== site.id));
                              }
                            }}
                            className="size-4 rounded text-primary focus:ring-primary"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-ink">{site.name}</span>
                            <span className="text-[11px] text-muted">{site.rootUrl}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-line mt-2">
                  <button
                    type="button"
                    onClick={() => setClientToEdit(null)}
                    className="ease-ui rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingSites || editClientSiteIds.length === 0}
                    className="ease-ui rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    {isUpdatingSites ? "Saving..." : "Save changes"}
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

        {/* Remove Client Viewer Confirmation Dialog */}
        {clientToRemove && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm client viewer removal"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-xs"
          >
            <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-dialog text-ink">
              <h3 className="text-base font-semibold m-0 text-crit">Remove client viewer?</h3>
              <p className="mt-2 text-sm text-muted">
                Are you sure you want to remove client viewer{" "}
                <strong>{clientToRemove.user.name || clientToRemove.user.email}</strong>? They will
                immediately lose access to the client portal and all assigned sites.
              </p>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line mt-4">
                <button
                  type="button"
                  onClick={() => setClientToRemove(null)}
                  className="ease-ui rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRemoveClient}
                  disabled={isRemovingClient}
                  className="ease-ui rounded-full bg-crit px-5 py-2 text-sm font-semibold text-white hover:bg-crit/90 disabled:opacity-50"
                >
                  {isRemovingClient ? "Removing..." : "Remove client viewer"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
