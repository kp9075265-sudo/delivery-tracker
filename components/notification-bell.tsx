"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Notification = {
  notification_id: number;
  message: string | null;
  sent_at: string | null;
  read_at: string | null;
  order_id: number | null;
};

type NotificationResponse = {
  unreadCount: number;
  notifications: Notification[];
};

function formatNotificationDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function NotificationBell() {
  const [data, setData] = useState<NotificationResponse>({ unreadCount: 0, notifications: [] });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function loadNotifications() {
    try {
      const response = await fetch("/api/notifications");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load notifications.");
      setData(body);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load notifications.");
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  async function markRead(notificationId: number) {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update notification.");
      await loadNotifications();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update notification.");
    }
  }

  async function markAllRead() {
    try {
      const response = await fetch("/api/notifications", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update notifications.");
      await loadNotifications();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update notifications.");
    }
  }

  return (
    <div className="notification-menu">
      <button
        className="notification-trigger"
        type="button"
        aria-label={`Notifications, ${data.unreadCount} unread`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {data.unreadCount > 0 && <span className="notification-count">{data.unreadCount > 99 ? "99+" : data.unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-popover" aria-label="Notifications">
          <div className="notification-heading">
            <strong>Notifications</strong>
            <button type="button" className="text-button" onClick={() => void markAllRead()} disabled={data.unreadCount === 0}>
              Mark all read
            </button>
          </div>
          {error && <p className="notification-error" role="alert">{error}</p>}
          {data.notifications.length === 0 && !error && <p className="empty">No notifications yet.</p>}
          <ul className="notification-list">
            {data.notifications.map((notification) => (
              <li className={notification.read_at ? "notification-item" : "notification-item unread"} key={notification.notification_id}>
                {notification.order_id ? (
                  <Link href={`/orders/${notification.order_id}`} onClick={() => { if (!notification.read_at) void markRead(notification.notification_id); setOpen(false); }}>
                    <strong>{notification.message || "Order update"}</strong>
                    <small>{formatNotificationDate(notification.sent_at)}</small>
                  </Link>
                ) : (
                  <button type="button" onClick={() => void markRead(notification.notification_id)} disabled={Boolean(notification.read_at)}>
                    <strong>{notification.message || "Update"}</strong>
                    <small>{formatNotificationDate(notification.sent_at)}</small>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
