"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, I } from "@/components/icons";
import { useToast } from "./toast-context";
import { apiClient } from "@/lib/api";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  type: string;
}

interface RawNotification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  type: string;
}

function timeAgo(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateString;
  }
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await apiClient<{
        items: RawNotification[];
        unreadCount: number;
      }>("/v1/notifications", {
        background: true,
      });
      if (res?.items) {
        setNotifications(res.items);
        setUnreadCount(res.unreadCount);
      }
    } catch {
      // Keep what is already shown; a signed-out session is handled by the re-auth dialog.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll every 45s for fresh notifications
    const interval = setInterval(fetchNotifications, 45000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleMarkAllRead = async () => {
    try {
      await apiClient("/v1/notifications/read-all", { method: "POST" });
    } catch {
      // Ignored for demo
    }
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })),
    );
    setUnreadCount(0);
    showToast("All notifications marked as read.");
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        await apiClient(`/v1/notifications/${item.id}`, { method: "PATCH" });
      } catch {
        // Ignored for demo
      }
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="ease-ui relative grid size-9 flex-none place-items-center rounded-full border border-line bg-surface text-ink hover:bg-subtle focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon d={I.bell} size={18} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 h-[18px] min-w-[18px] rounded-[9px] bg-crit px-[5px] text-[11px] leading-[18px] font-bold text-surface text-center"
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notification Centre"
          className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 rounded-2xl border border-line bg-surface p-4 shadow-dialog text-ink"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold m-0">Notifications</h2>
              {unreadCount > 0 && (
                <span className="rounded-full bg-crit/15 px-2 py-0.5 text-xs font-bold text-crit">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-primary hover:underline border-0 bg-transparent cursor-pointer p-0"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="divide-y divide-line max-h-72 overflow-y-auto my-2">
            {loading && notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">
                Loading notifications...
              </p>
            ) : notifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                You are all caught up!
              </p>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.readAt;
                const isWarning =
                  n.type.includes("regression") ||
                  n.type.includes("failed") ||
                  n.type.includes("disabled");
                const content = (
                  <div className="flex items-start gap-3 w-full">
                    <span className="grid size-6 place-items-center rounded-full bg-subtle text-muted flex-none mt-0.5">
                      <Icon
                        d={isWarning ? I.serious : I.fixed}
                        size={14}
                        stroke={isWarning ? "var(--ser)" : "var(--ok)"}
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            isUnread ? "text-ink font-bold" : "text-muted"
                          }`}
                        >
                          {n.title}
                        </span>
                        <span className="text-[11px] text-muted whitespace-nowrap">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted m-0 mt-0.5 leading-4">
                        {n.body}
                      </p>
                    </div>
                    {isUnread && (
                      <span className="size-2 rounded-full bg-primary flex-none mt-1.5" />
                    )}
                  </div>
                );

                return (
                  <div key={n.id} className="py-2.5">
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => handleItemClick(n)}
                        className="block rounded-lg p-1.5 hover:bg-subtle transition-colors"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className="w-full text-left rounded-lg p-1.5 hover:bg-subtle transition-colors border-0 bg-transparent cursor-pointer"
                      >
                        {content}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="pt-2 border-t border-line flex items-center justify-between text-xs text-muted">
            <span>Notification Centre</span>
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="text-primary hover:underline"
            >
              Preferences
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
