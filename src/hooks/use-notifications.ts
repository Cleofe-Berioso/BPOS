"use client";

import { useCallback, useEffect, useState } from "react";
import type { Notification } from "@/types/notifications";
import {
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/mock-notifications";

/**
 * Custom hook for managing notification state and interactions.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/applicant/notifications", {
        cache: "no-store",
        signal,
      });

      let data: {
        notifications?: Notification[];
        records?: Notification[];
        error?: string;
      } = {};
      try {
        data = await response.json();
      } catch {
        if (!response.ok) {
          throw new Error(`Server error (${response.status})`);
        }
      }

      if (!response.ok) {
        throw new Error(data.error || `Server error (${response.status})`);
      }

      const notifs = data.notifications ?? data.records ?? [];
      setNotifications(notifs);
      setUnreadCount(getUnreadCount(notifs));
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unknown error loading notifications");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchNotifications(controller.signal);
    return () => controller.abort();
  }, [fetchNotifications]);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) =>
        n.id === notificationId ? markNotificationAsRead(n) : n
      );
      setUnreadCount(getUnreadCount(updated));
      return updated;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = markAllNotificationsAsRead(prev);
      setUnreadCount(0);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const addLocalNotification = useCallback((partial?: Partial<Notification>) => {
    const notif: Notification = {
      id:
        partial?.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: partial?.title ?? "New notification",
      message: partial?.message ?? "You have a new notification",
      type: partial?.type ?? ("APPLICATION_SUBMITTED" as Notification["type"]),
      timestamp: new Date().toISOString(),
      isRead: false,
      applicationId: partial?.applicationId,
      applicationNumber: partial?.applicationNumber,
    } as Notification;

    setNotifications((prev) => {
      const updated = [notif, ...prev];
      setUnreadCount(getUnreadCount(updated));
      return updated;
    });
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    clearAll,
    addLocalNotification,
    refetch: fetchNotifications,
  };
}
