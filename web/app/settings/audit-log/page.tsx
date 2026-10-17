"use client";

import React from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { useToast } from "@/components/shell/toast-context";

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  ip: string;
}

const AUDIT_LOGS: AuditEntry[] = [
  {
    id: "a-1",
    action: "member.invited",
    actor: "Daniel Mwangi",
    target: "mark@brightline.studio",
    timestamp: "14 Oct 2026, 14:22",
    ip: "102.134.12.1",
  },
  {
    id: "a-2",
    action: "site.created",
    actor: "Daniel Mwangi",
    target: "oakhaus.com",
    timestamp: "12 Aug 2026, 09:15",
    ip: "102.134.12.1",
  },
  {
    id: "a-3",
    action: "org.created",
    actor: "Daniel Mwangi",
    target: "Brightline Studio",
    timestamp: "1 Aug 2026, 11:00",
    ip: "102.134.12.1",
  },
];

export default function AuditLogSettingsPage() {
  const { showToast } = useToast();

  return (
    <SettingsLayout
      title="Audit Log"
      description="Immutable record of security and administrative actions within this organisation."
    >
      <div className="flex flex-col gap-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Showing last 30 days of activity</span>
          <button
            type="button"
            onClick={() => showToast("Exporting audit log as CSV...")}
            className="ease-ui rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-subtle"
          >
            Export CSV
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3 text-right">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs">
                {AUDIT_LOGS.map((entry) => (
                  <tr key={entry.id} className="hover:bg-subtle/50 transition-colors">
                    <td className="px-4 py-3 text-muted">{entry.timestamp}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-ink">{entry.action}</td>
                    <td className="px-4 py-3 text-ink">{entry.actor}</td>
                    <td className="px-4 py-3 text-muted">{entry.target}</td>
                    <td className="px-4 py-3 text-right text-muted font-mono">{entry.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}
