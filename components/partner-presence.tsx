"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useSupabaseClient } from "@/lib/supabase/client";

type PartnerPresenceProps = {
  listId: string;
  currentUserId: string;
  displayName: string;
  memberIds: string[];
};

type PresencePayload = {
  user_id: string;
  name: string;
};

export function PartnerPresence({
  listId,
  currentUserId,
  displayName,
  memberIds,
}: PartnerPresenceProps) {
  const t = useTranslations("presence");
  const supabase = useSupabaseClient();
  const [onlineOthers, setOnlineOthers] = useState<string[]>([]);

  const memberSet = useMemo(() => new Set(memberIds), [memberIds]);

  useEffect(() => {
    const channel = supabase.channel(`list:${listId}:presence`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresencePayload>();
        const names: string[] = [];
        for (const key of Object.keys(state)) {
          if (key === currentUserId) continue;
          if (!memberSet.has(key)) continue;
          const payloads = state[key];
          const name = payloads?.[0]?.name;
          if (name) names.push(name);
        }
        setOnlineOthers(names);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: currentUserId, name: displayName });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, listId, currentUserId, displayName, memberSet]);

  if (onlineOthers.length === 0) return null;

  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-duo-teal opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-duo-teal" />
      </span>
      {onlineOthers.length === 1
        ? t("viewingOne", { name: onlineOthers[0] })
        : t("viewingMany", { count: onlineOthers.length })}
    </p>
  );
}
