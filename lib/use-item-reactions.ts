"use client";

import { useCallback, useEffect, useState } from "react";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { ItemReaction } from "@/lib/types";

function buildReactionsMap(reactions: ItemReaction[]): Map<string, ItemReaction[]> {
  const map = new Map<string, ItemReaction[]>();
  for (const reaction of reactions) {
    const list = map.get(reaction.item_id) ?? [];
    list.push(reaction);
    map.set(reaction.item_id, list);
  }
  return map;
}

export function useItemReactions(listId: string, initialReactions: ItemReaction[]) {
  const supabase = useSupabaseClient();
  const [reactionsByItemId, setReactionsByItemId] = useState<Map<string, ItemReaction[]>>(() =>
    buildReactionsMap(initialReactions),
  );

  const refetchReactions = useCallback(
    async (itemIds: string[]) => {
      if (itemIds.length === 0) {
        setReactionsByItemId(new Map());
        return;
      }

      const { data: reactionRows } = await supabase
        .from("item_reactions")
        .select("*")
        .in("item_id", itemIds);

      if (reactionRows) {
        setReactionsByItemId(buildReactionsMap(reactionRows as ItemReaction[]));
      }
    },
    [supabase],
  );

  useEffect(() => {
    const channel = supabase
      .channel(`item_reactions:${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "item_reactions" },
        () => {
          void (async () => {
            const { data: items } = await supabase
              .from("items")
              .select("id")
              .eq("list_id", listId)
              .is("removed_at", null);
            await refetchReactions((items ?? []).map((row) => row.id));
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [listId, supabase, refetchReactions]);

  const reactionsForItem = useCallback(
    (itemId: string): ItemReaction[] => reactionsByItemId.get(itemId) ?? [],
    [reactionsByItemId],
  );

  return {
    reactionsByItemId,
    setReactionsByItemId,
    refetchReactions,
    reactionsForItem,
  };
}
