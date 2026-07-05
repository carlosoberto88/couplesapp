"use client";

import { useEffect, useRef } from "react";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Item } from "@/lib/types";

type RealtimeItemsHandlers = {
  onUpsert: (row: Item) => void;
  onRemove: (id: string) => void;
  onOtherUserAdd: (row: Item) => void;
  onOtherUserCheck: (row: Item, checked: boolean) => void;
  onOtherUserRemove: (row: Item) => void;
  onRefetch: () => void;
};

/**
 * Subscribes to Postgres changes on `items` for one list, reconciling every
 * event into local state (server wins) and triggering a full refetch on
 * focus/visibility/reconnect. Handlers are routed through a ref so the
 * subscription effect only re-runs when `listId`/`currentUserId` change, not
 * on every render of the owning component.
 */
export function useRealtimeItems(
  listId: string,
  currentUserId: string,
  handlers: RealtimeItemsHandlers,
) {
  const supabase = useSupabaseClient();
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const channel = supabase
      .channel(`items:${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "items",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as Item;
            handlersRef.current.onUpsert(row);
            if (payload.eventType === "INSERT" && row.created_by !== currentUserId) {
              handlersRef.current.onOtherUserAdd(row);
            }
            if (payload.eventType === "UPDATE") {
              const oldRow = payload.old as Item;
              const wasChecked = oldRow.checked_at !== null;
              const isChecked = row.checked_at !== null;
              if (wasChecked !== isChecked) {
                const actor = isChecked ? row.checked_by : oldRow.checked_by;
                if (actor && actor !== currentUserId) {
                  handlersRef.current.onOtherUserCheck(row, isChecked);
                }
              }
            }
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as Item;
            handlersRef.current.onRemove(row.id);
            if (row.created_by !== currentUserId) {
              handlersRef.current.onOtherUserRemove(row);
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Covers both the initial subscribe and any resubscribe below —
          // server wins, so refetch to reconcile anything missed while
          // disconnected.
          handlersRef.current.onRefetch();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          channel.subscribe();
        }
      });

    function handleFocus() {
      handlersRef.current.onRefetch();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        handlersRef.current.onRefetch();
      }
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [listId, currentUserId, supabase]);
}
