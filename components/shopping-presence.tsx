"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { useSupabaseClient } from "@/lib/supabase/client";

type ShoppingPresenceProps = {
  listId: string;
  currentUserId: string;
  displayName: string;
  memberIds: string[];
  /** Local "I'm at store" flag — tracks presence when true, untracks when false. */
  active: boolean;
};

type ShoppingPresencePayload = {
  user_id: string;
  name: string;
  shopping: boolean;
};

type ShoppingOther = {
  id: string;
  name: string;
};

export function ShoppingPresence({
  listId,
  currentUserId,
  displayName,
  memberIds,
  active,
}: ShoppingPresenceProps) {
  const t = useTranslations("shoppingNow");
  const supabase = useSupabaseClient();
  const [othersShopping, setOthersShopping] = useState<ShoppingOther[]>([]);

  const memberSet = useMemo(() => new Set(memberIds), [memberIds]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const channel = supabase.channel(`list:${listId}:shopping`, {
      config: { presence: { key: currentUserId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<ShoppingPresencePayload>();
        const others: ShoppingOther[] = [];
        for (const key of Object.keys(state)) {
          if (key === currentUserId) continue;
          if (!memberSet.has(key)) continue;
          const payloads = state[key];
          const payload = payloads?.find((entry) => entry.shopping);
          if (payload?.name) others.push({ id: key, name: payload.name });
        }
        setOthersShopping(others);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          subscribedRef.current = true;
          if (activeRef.current) {
            await channel.track({ user_id: currentUserId, name: displayName, shopping: true });
          }
        }
      });

    return () => {
      subscribedRef.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, listId, currentUserId, displayName, memberSet]);

  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current) return;

    if (active) {
      void channel.track({ user_id: currentUserId, name: displayName, shopping: true });
    } else {
      void channel.untrack();
    }
  }, [active, currentUserId, displayName]);

  if (othersShopping.length === 0) return null;

  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--duo-coral)] opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-[var(--duo-coral)]" />
      </span>
      {t("partnerBanner", { name: othersShopping[0].name })}
    </p>
  );
}
