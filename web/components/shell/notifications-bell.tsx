"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { useToast } from "./toast-context";

interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  type: "warning" | "success" | "info";
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Oakhaus Furniture regression",
    detail: "Scan #23 completed with 1 new regression in Product images.",
    time: "2 hours ago",
    unread: true,
    type: "warning",
  },
  {
    id: "notif-2",
    title: "Mwanga Solar scan failed",
    detail: "Weekly scan failed: server returned HTTP 503.",
    time: "Yesterday",
    unread: true,
    type: "warning",
  },
  {
    id: "notif-3",
    title: "Baraka Bikes reached Good band",
    detail: "Accessibility score improved to 91 with 0 critical issues.",
    time: "3 days ago",
    unread: true,
    type: "success",
  },
];

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const { showToast } = useToast();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter((n) => n.unread).length;

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

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    showToast("All notifications marked as read.");
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
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
                onClick={markAllRead}
                className="text-xs font-medium text-primary hover:underline border-0 bg-transparent cursor-pointer p-0"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="divide-y divide-line max-h-72 overflow-y-auto my-2">
            {notifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">You are all caught up!</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="py-3 flex items-start gap-3">
                  <span className="grid size-6 place-items-center rounded-full bg-subtle text-muted flex-none mt-0.5">
                    <Icon
                      d={n.type === "warning" ? I.serious : I.fixed}
                      size={14}
                      stroke={n.type === "warning" ? "var(--ser)" : "var(--ok)"}
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${n.unread ? "text-ink" : "text-muted"}`}>
                        {n.title}
                      </span>
                      <span className="text-[11px] text-muted whitespace-nowrap">{n.time}</span>
                    </div>
                    <p className="text-xs text-muted m-0 mt-0.5 leading-4">{n.detail}</p>
                  </div>
                  {n.unread && <span className="size-2 rounded-full bg-primary flex-none mt-1.5" />}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="pt-2 border-t border-line text-center">
            <span className="text-xs text-muted">Notification Centre (S-50)</span>
          </div>
        </div>
      )}
    </div>
  );
}
