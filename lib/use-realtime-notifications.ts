"use client";

import { useEffect, useRef } from "react";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

type RealtimeNotificationsHandlers = {
  onInsert?: (row: Notification) => void;
  onUpdate?: (row: Notification) => void;
  onRefetch?: () => void;
};

type UseRealtimeNotificationsArgs = RealtimeNotificationsHandlers & {
  userId: string | null | undefined;
};

/**
 * Subscribes to Postgres changes on `notifications` for one user, reconciling
 * inserts/updates into local state (server wins) and triggering a full
 * refetch on focus/visibility/reconnect. Handlers are routed through a ref so
 * the subscription effect only re-runs when `userId`/`supabase` change, not
 * on every render of the owning component.
 */
export function useRealtimeNotifications({
  userId,
  onInsert,
  onUpdate,
  onRefetch,
}: UseRealtimeNotificationsArgs) {
  const supabase = useSupabaseClient();
  const handlersRef = useRef({ onInsert, onUpdate, onRefetch });
  useEffect(() => {
    handlersRef.current = { onInsert, onUpdate, onRefetch };
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Notification;
            handlersRef.current.onInsert?.(row);
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Notification;
            handlersRef.current.onUpdate?.(row);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          handlersRef.current.onRefetch?.();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          channel.subscribe();
        }
      });

    function handleFocus() {
      handlersRef.current.onRefetch?.();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        handlersRef.current.onRefetch?.();
      }
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [userId, supabase]);
}
