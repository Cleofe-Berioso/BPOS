"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, X } from "lucide-react";
import { formatNotificationTime, getNotificationIcon } from "@/lib/mock-notifications";
import { useNotifications } from "@/hooks/use-notifications";
import type { Notification } from "@/types/notifications";

/**
 * Notification Dropdown Component
 * Displays recent notifications with mark as read functionality
 * Located in the Applicant Portal header
 */
export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { notifications, unreadCount, isLoading, error, markAsRead, markAllAsRead, refetch } =
    useNotifications();

  /**
   * Close dropdown when clicking outside
   */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  /**
   * Close dropdown on Escape key
   */
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-color)] bg-white text-[var(--ink-muted)] shadow-sm transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
      >
        <Bell className="h-4 w-4" />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success)] text-xs font-semibold text-white"
            aria-label={`${unreadCount} unread notifications`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <section
          ref={dropdownRef}
          aria-label="Notifications panel"
          className="absolute -right-2 top-12 z-50 w-96 max-w-[calc(100vw-1rem)] rounded-2xl border border-[var(--border-color)] bg-white shadow-xl sm:w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Notifications</h2>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-semibold text-[var(--primary)] transition-colors hover:text-[var(--primary-strong)]"
                title="Mark all as read"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Content */}
          <div className="max-h-[min(400px,calc(100dvh-6rem))] overflow-y-auto overscroll-contain">
            {isLoading ? (
              <div className="flex items-center justify-center px-4 py-8">
                <p className="text-sm text-[var(--ink-muted)]">Loading notifications…</p>
              </div>
            ) : error ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-[var(--danger)]">Failed to load notifications</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="mt-3 text-xs font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]"
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8">
                <Bell className="h-8 w-8 text-[var(--border-color)] mb-2" />
                <p className="text-sm font-medium text-[var(--ink-muted)]">No notifications yet</p>
                <p className="text-xs text-[var(--ink-muted)] mt-1">
                  You&apos;re all caught up! Check back soon.
                </p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {notifications.slice(0, 8).map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-[var(--border-color)] px-4 py-3">
              <Link
                href="/applicant/notifications"
                onClick={() => setIsOpen(false)}
                className="inline-block text-sm font-semibold text-[var(--primary)] transition-colors hover:text-[var(--primary-strong)]"
              >
                View all notifications →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Individual Notification Item in Dropdown
 */
function NotificationItem({
  notification,
  onMarkAsRead,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}) {
  const iconType = getNotificationIcon(notification.type);

  const getIconColor = (): string => {
    switch (iconType) {
      case "check":
        return "text-[var(--primary)]";
      case "alert":
        return "text-[var(--warning)]";
      case "error":
        return "text-[var(--danger)]";
      default:
        return "text-[var(--info)]";
    }
  };

  const getBgColor = (): string => {
    if (notification.isRead) return "hover:bg-[var(--muted-surface)]";
    return "bg-[var(--primary-soft)] hover:bg-[var(--success-soft)]";
  };

  const getLeftBorderColor = (): string => {
    if (notification.isRead) return "border-l-[var(--border-color)]";
    return "border-l-[var(--primary)]";
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border-l-3 px-3 py-2.5 transition-colors ${getBgColor()} ${getLeftBorderColor()}`}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex-shrink-0 ${getIconColor()}`}>
        {iconType === "check" && <Bell className="h-4 w-4" />}
        {iconType === "alert" && <Bell className="h-4 w-4" />}
        {iconType === "error" && <X className="h-4 w-4" />}
        {iconType === "info" && <Bell className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)] line-clamp-1">
              {notification.title}
            </p>
            <p className="text-xs text-[var(--ink-muted)] line-clamp-2 mt-0.5">
              {notification.message}
            </p>
          </div>

          {/* Mark as read button */}
          {!notification.isRead && (
            <button
              onClick={() => onMarkAsRead(notification.id)}
              className="ml-2 flex-shrink-0 text-[var(--primary)] transition-colors hover:text-[var(--primary-strong)]"
              title="Mark as read"
              aria-label={`Mark "${notification.title}" as read`}
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--ink-muted)] mt-1">
          {formatNotificationTime(notification.timestamp)}
        </p>
      </div>
    </div>
  );
}
