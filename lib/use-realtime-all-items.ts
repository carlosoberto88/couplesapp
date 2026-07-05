"use client";

import { useEffect, useRef } from "react";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Item, ItemListContext } from "@/lib/types";
import { attachListToItem } from "@/lib/all-items-utils";

type RealtimeAllItemsHandlers = {
  onUpsert: (row: ItemWithListContext) => void;
  onRemove: (id: string) => void;
  onRefetch: () => void;
};

export type ItemWithListContext = Item & { lists: ItemListContext };

type UseRealtimeAllItemsOptions = {
  currentUserId: string;
  listsById: Map<string, ItemListContext>;
  handlers: RealtimeAllItemsHandlers;
};

/**
 * Subscribes to all accessible item changes (RLS-scoped) and merges them
 * into the cross-list view using the known active-list metadata map.
 */
export function useRealtimeAllItems({
  currentUserId,
  listsById,
  handlers,
}: UseRealtimeAllItemsOptions) {
  const supabase = useSupabaseClient();
  const handlersRef = useRef(handlers);
  const listsByIdRef = useRef(listsById);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    listsByIdRef.current = listsById;
  }, [listsById]);

  useEffect(() => {
    const channel = supabase
      .channel(`items:all:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as Item;
            const withList = attachListToItem(row, listsByIdRef.current);
            if (!withList) {
              handlersRef.current.onRefetch();
              return;
            }
            handlersRef.current.onUpsert(withList);
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as Item;
            handlersRef.current.onRemove(row.id);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
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
  }, [currentUserId, supabase]);
}
