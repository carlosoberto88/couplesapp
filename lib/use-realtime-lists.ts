"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useSupabaseClient } from "@/lib/supabase/client";

/**
 * Refreshes server-rendered list data when membership or list metadata changes
 * on the lists index (join/leave, rename, archive).
 */
export function useRealtimeListsIndex(userId: string | null | undefined) {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`lists-index:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list_members",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          routerRef.current.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lists",
        },
        () => {
          routerRef.current.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lists",
        },
        () => {
          routerRef.current.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "lists",
        },
        () => {
          routerRef.current.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, supabase]);
}

/**
 * Refreshes list detail when members or pending invites change for this list.
 */
export function useRealtimeListMembers(listId: string) {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  useEffect(() => {
    const channel = supabase
      .channel(`list-members:${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list_members",
          filter: `list_id=eq.${listId}`,
        },
        () => {
          routerRef.current.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list_invites",
          filter: `list_id=eq.${listId}`,
        },
        () => {
          routerRef.current.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lists",
          filter: `id=eq.${listId}`,
        },
        () => {
          routerRef.current.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [listId, supabase]);
}
