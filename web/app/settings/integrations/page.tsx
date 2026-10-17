"use client";

import React from "react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { Icon, I } from "@/components/icons";
import { useToast } from "@/components/shell/toast-context";

export default function IntegrationsSettingsPage() {
  const { showToast } = useToast();

  const handleConnect = (service: string) => {
    showToast(`Connecting to ${service}... (OAuth flow)`);
  };

  return (
    <SettingsLayout
      title="Integrations"
      description="Connect Plainsight with your team’s development tools, issue trackers, and chat apps."
    >
      <div className="flex flex-col gap-6 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Slack */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink text-base">Slack</span>
                <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">Not connected</span>
              </div>
              <p className="text-xs text-muted m-0 leading-5">
                Send weekly scan summaries and critical regressions directly to a designated Slack channel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleConnect("Slack")}
              className="ease-ui rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle self-start"
            >
              Connect Slack
            </button>
          </div>

          {/* Jira */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink text-base">Jira</span>
                <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">Not connected</span>
              </div>
              <p className="text-xs text-muted m-0 leading-5">
                Automatically create Jira tickets for accessibility issues with exact selectors and fix steps.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleConnect("Jira")}
              className="ease-ui rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle self-start"
            >
              Connect Jira
            </button>
          </div>

          {/* GitHub */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink text-base">GitHub</span>
                <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">Not connected</span>
              </div>
              <p className="text-xs text-muted m-0 leading-5">
                Open GitHub issues and tag relevant theme repositories when regressions occur.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleConnect("GitHub")}
              className="ease-ui rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle self-start"
            >
              Connect GitHub
            </button>
          </div>

          {/* Webhooks */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink text-base">Webhooks</span>
                <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">Custom</span>
              </div>
              <p className="text-xs text-muted m-0 leading-5">
                Send real-time JSON payloads on scan completion, status changes, and regression alerts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleConnect("Webhooks")}
              className="ease-ui rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle self-start"
            >
              Configure webhooks
            </button>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}
