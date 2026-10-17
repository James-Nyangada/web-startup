"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { ISSUES, type Issue } from "@/lib/site-data";
import { useToast } from "@/components/shell/toast-context";

export default function MyTasksPage() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<Issue[]>(
    ISSUES.filter((i) => i.assignee === "DM" || !i.assignee)
  );

  const handleResolve = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    showToast("Task marked as resolved.");
  };

  return (
    <AppShell
      active="tasks"
      crumbs={[
        { label: "Brightline Studio", href: "/overview" },
        { label: "My tasks" },
      ]}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="m-0 font-serif text-[32px] sm:text-[38px] font-normal text-ink">
              My tasks
            </h1>
            <p className="mt-1 text-sm text-muted">
              Accessibility issues assigned to you across all monitored sites.
            </p>
          </div>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-ptext">
            {tasks.length} open {tasks.length === 1 ? "task" : "tasks"}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {tasks.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              All caught up! No open tasks currently assigned to you.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-subtle/50 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="grid size-8 place-items-center rounded-lg border border-line bg-subtle flex-none mt-0.5">
                      <Icon
                        d={task.sev === "critical" ? I.critical : task.sev === "serious" ? I.serious : I.minor}
                        size={16}
                        stroke={task.sev === "critical" ? "var(--crit)" : task.sev === "serious" ? "var(--ser)" : "var(--primary)"}
                      />
                    </span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/sites/oakhaus?tab=issues&issue=${task.id}`}
                          className="font-semibold text-sm text-ink hover:underline truncate"
                        >
                          {task.title}
                        </Link>
                        <span className="text-xs text-muted">· {task.template}</span>
                      </div>
                      <span className="text-xs text-muted mt-0.5">
                        WCAG: {task.wcag} · {task.due ?? "No due date"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Link
                      href={`/sites/oakhaus?tab=issues&issue=${task.id}`}
                      className="ease-ui rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-subtle no-underline"
                    >
                      View details
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleResolve(task.id)}
                      className="ease-ui rounded-full bg-surface border border-line px-3 py-1.5 text-xs font-semibold text-ok hover:bg-subtle"
                    >
                      Mark fixed
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
