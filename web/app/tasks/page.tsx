"use client";

import React, { useState, useEffect, useId } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon, I } from "@/components/icons";
import { appApi, type ApiMyTask } from "@/lib/app-api";
import { useActiveOrg } from "@/lib/use-active-org";
import { useToast } from "@/components/shell/toast-context";

type TaskGroupKey = "overdue" | "this_week" | "later" | "no_due_date";

interface TaskGroupMeta {
  key: TaskGroupKey;
  title: string;
  description: string;
  badgeClass: string;
  iconD: string;
}

const GROUPS_META: TaskGroupMeta[] = [
  {
    key: "overdue",
    title: "Overdue",
    description: "Tasks whose due date has passed and need immediate remediation",
    badgeClass: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-900",
    iconD: I.critical,
  },
  {
    key: "this_week",
    title: "Due This Week",
    description: "Tasks scheduled for remediation within the next 7 days",
    badgeClass: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-900",
    iconD: I.serious,
  },
  {
    key: "later",
    title: "Later",
    description: "Tasks scheduled for resolution after this week",
    badgeClass: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-900",
    iconD: I.circle,
  },
  {
    key: "no_due_date",
    title: "No Due Date",
    description: "Assigned tasks without a target resolution date",
    badgeClass: "bg-subtle text-muted border-line",
    iconD: I.pin,
  },
];

function classifyTask(dueDate: string | null | undefined): TaskGroupKey {
  if (!dueDate) return "no_due_date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "this_week";
  return "later";
}

function formatDueDate(dueDate: string | null | undefined): string {
  if (!dueDate) return "No due date";
  const due = new Date(dueDate);
  return due.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MyTasksPage() {
  const { showToast } = useToast();
  const { slug, org, loading: orgLoading } = useActiveOrg();
  const orgSlug = slug ?? "";

  const [tasks, setTasks] = useState<ApiMyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDateModalTask, setActiveDateModalTask] = useState<ApiMyTask | null>(null);
  const [newDueDate, setNewDueDate] = useState("");
  const [updatingDate, setUpdatingDate] = useState(false);

  const dueDateModalId = useId();

  // Load tasks from real cross-site endpoint
  useEffect(() => {
    if (orgLoading) return;
    if (!orgSlug) {
      setLoading(false);
      return;
    }
    let canceled = false;
    async function loadTasks() {
      try {
        setLoading(true);
        const data = await appApi.listMyTasks(orgSlug);
        if (!canceled) setTasks(data ?? []);
      } catch {
        if (!canceled) setTasks([]);
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    loadTasks();
    return () => {
      canceled = true;
    };
  }, [orgSlug, orgLoading]);

  const handleResolve = async (task: ApiMyTask) => {
    try {
      setResolvingId(task.id);
      await appApi.recheck(orgSlug, task.id);
      showToast("Recheck queued. EveryVisitor will verify the fix on the next page re-scan.");
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      showToast("Task marked for re-scan verification.");
    } finally {
      setResolvingId(null);
    }
  };

  const handleSaveDueDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDateModalTask) return;

    setUpdatingDate(true);
    try {
      await appApi.setDueDate(orgSlug, activeDateModalTask.id, newDueDate || null);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === activeDateModalTask.id ? { ...t, dueDate: newDueDate || null } : t,
        ),
      );
      showToast("Due date updated.");
      setActiveDateModalTask(null);
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === activeDateModalTask.id ? { ...t, dueDate: newDueDate || null } : t,
        ),
      );
      showToast("Due date updated.");
      setActiveDateModalTask(null);
    } finally {
      setUpdatingDate(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.title && t.title.toLowerCase().includes(q)) ||
      t.ruleId.toLowerCase().includes(q) ||
      (t.siteName && t.siteName.toLowerCase().includes(q)) ||
      (t.templateKey && t.templateKey.toLowerCase().includes(q))
    );
  });

  const overdueCount = tasks.filter((t) => classifyTask(t.dueDate) === "overdue").length;
  const thisWeekCount = tasks.filter((t) => classifyTask(t.dueDate) === "this_week").length;

  return (
    <AppShell
      active="tasks"
      crumbs={[
        { label: org?.name ?? "Overview", href: "/overview" },
        { label: "My tasks" },
      ]}
    >
      <div className="flex flex-col gap-6">
        {/* Header & Stats Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="m-0 font-serif text-[32px] sm:text-[38px] font-normal text-ink">
              My tasks
            </h1>
            <p className="mt-1 text-sm text-muted">
              Accessibility issues assigned to you across all monitored sites, prioritized by due date.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-600 dark:bg-red-400 animate-pulse" />
                {overdueCount} Overdue
              </span>
            )}
            {thisWeekCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-400" />
                {thisWeekCount} Due This Week
              </span>
            )}
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-ptext">
              {tasks.length} total open {tasks.length === 1 ? "task" : "tasks"}
            </span>
          </div>
        </div>

        {/* Filter Input */}
        {tasks.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Icon
                d={I.search}
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                placeholder="Filter by issue title, rule ID, site, or template..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                aria-label="Filter tasks"
              />
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-xs text-muted hover:text-ink font-medium"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface p-12 text-center text-sm text-muted shadow-card">
            Loading your assigned tasks...
          </div>
        ) : tasks.length === 0 ? (
          /* Empty State */
          <div className="overflow-hidden rounded-2xl border border-line bg-surface p-12 text-center shadow-card">
            <Icon d={I.check} size={36} className="mx-auto text-emerald-600 mb-3" />
            <h2 className="text-base font-semibold text-ink m-0">
              All caught up!
            </h2>
            <p className="mt-1 text-sm text-muted max-w-sm mx-auto">
              There are no open accessibility issues currently assigned to you across any sites.
            </p>
          </div>
        ) : (
          /* Grouped Task Sections (P5-09) */
          <div className="flex flex-col gap-8">
            {GROUPS_META.map((group) => {
              const groupTasks = filteredTasks.filter(
                (t) => classifyTask(t.dueDate) === group.key,
              );

              if (groupTasks.length === 0) return null;

              return (
                <section
                  key={group.key}
                  aria-labelledby={`heading-${group.key}`}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`inline-flex items-center justify-center rounded-lg p-1.5 ${group.badgeClass}`}>
                        <Icon d={group.iconD} size={15} />
                      </span>
                      <div>
                        <h2
                          id={`heading-${group.key}`}
                          className="m-0 text-base font-semibold text-ink"
                        >
                          {group.title}
                        </h2>
                        <span className="text-xs text-muted">
                          {group.description}
                        </span>
                      </div>
                    </div>
                    <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-semibold text-ink">
                      {groupTasks.length}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                    <ul role="list" className="divide-y divide-line m-0 p-0 list-none">
                      {groupTasks.map((task) => (
                        <li
                          key={task.id}
                          className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-subtle/50 transition-colors"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <span className="grid size-8 place-items-center rounded-lg border border-line bg-subtle flex-none mt-0.5">
                              <Icon
                                d={
                                  task.impact === "critical"
                                    ? I.critical
                                    : task.impact === "serious"
                                      ? I.serious
                                      : task.impact === "moderate"
                                        ? I.moderate
                                        : I.minor
                                }
                                size={16}
                                stroke={
                                  task.impact === "critical"
                                    ? "var(--crit)"
                                    : task.impact === "serious"
                                      ? "var(--ser)"
                                      : "var(--primary)"
                                }
                              />
                            </span>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  href={`/sites/${task.siteId}?tab=issues&issue=${task.id}`}
                                  className="font-semibold text-sm text-ink hover:underline truncate"
                                >
                                  {task.title || task.ruleId}
                                </Link>
                                <span className="rounded-md bg-subtle px-2 py-0.5 text-xs text-muted font-mono">
                                  {task.ruleId}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted mt-1 flex-wrap">
                                <span className="font-medium text-ink">
                                  {task.siteName || "Monitored Site"}
                                </span>
                                {task.templateKey && (
                                  <>
                                    <span>·</span>
                                    <span>Template: {task.templateKey}</span>
                                  </>
                                )}
                                <span>·</span>
                                <span>
                                  {task.occurrenceCount} {task.occurrenceCount === 1 ? "occurrence" : "occurrences"}
                                </span>
                                <span>·</span>
                                <span
                                  className={
                                    group.key === "overdue"
                                      ? "font-semibold text-red-600 dark:text-red-400"
                                      : group.key === "this_week"
                                        ? "font-semibold text-amber-600 dark:text-amber-400"
                                        : ""
                                  }
                                >
                                  Due: {formatDueDate(task.dueDate)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDateModalTask(task);
                                setNewDueDate(task.dueDate || "");
                              }}
                              className="ease-ui flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle"
                              title="Update target resolution due date"
                            >
                              <Icon d={I.calendar} size={13} />
                              <span>Set date</span>
                            </button>
                            <Link
                              href={`/sites/${task.siteId}?tab=issues&issue=${task.id}`}
                              className="ease-ui rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle no-underline"
                            >
                              View details
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleResolve(task)}
                              disabled={resolvingId === task.id}
                              className="ease-ui flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-subtle disabled:opacity-40"
                              title="Request immediate automated verification recheck"
                            >
                              <Icon d={I.check} size={13} />
                              <span>{resolvingId === task.id ? "Queuing..." : "Mark fixed"}</span>
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Change Due Date Modal */}
        {activeDateModalTask && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dueDateModalId}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs"
          >
            <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-line">
                <h3 id={dueDateModalId} className="text-base font-semibold text-ink m-0">
                  Set Resolution Due Date
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveDateModalTask(null)}
                  className="rounded-lg p-1 text-muted hover:bg-subtle hover:text-ink"
                >
                  <Icon d={I.close} size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveDueDate} className="mt-4 flex flex-col gap-4">
                <div className="rounded-xl border border-line bg-subtle/50 p-3 text-xs text-muted">
                  <div className="font-semibold text-ink truncate mb-1">
                    {activeDateModalTask.title || activeDateModalTask.ruleId}
                  </div>
                  <div>Site: {activeDateModalTask.siteName || "Monitored Site"}</div>
                </div>

                <div>
                  <label htmlFor="due-date-input" className="block text-xs font-semibold text-ink mb-1.5">
                    Target Resolution Date
                  </label>
                  <input
                    id="due-date-input"
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  />
                  <span className="text-xs text-muted mt-1 block">
                    Leave blank to clear the due date.
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
                  {newDueDate && (
                    <button
                      type="button"
                      onClick={() => setNewDueDate("")}
                      className="text-xs text-muted hover:text-ink underline"
                    >
                      Clear date
                    </button>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setActiveDateModalTask(null)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-subtle"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updatingDate}
                      className="ease-ui rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                    >
                      {updatingDate ? "Saving..." : "Save date"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
