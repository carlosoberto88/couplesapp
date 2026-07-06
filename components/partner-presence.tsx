"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { MemberColor } from "@/lib/member-colors";

type PartnerPresenceProps = {
  listId: string;
  currentUserId: string;
  displayName: string;
  memberIds: string[];
  /** Stable per-member hue map (from `buildMemberColorMap`) used to color the live dot. Falls back to teal if unresolvable. */
  colorMap?: Map<string, MemberColor>;
};

type PresencePayload = {
  user_id: string;
  name: string;
};

type OnlineOther = {
  id: string;
  name: string;
};

const FALLBACK_DOT_COLOR: MemberColor = {
  key: "teal",
  color: "var(--duo-teal)",
  tint: "var(--duo-teal-tint)",
};

export function PartnerPresence({
  listId,
  currentUserId,
  displayName,
  memberIds,
  colorMap,
}: PartnerPresenceProps) {
  const t = useTranslations("presence");
  const supabase = useSupabaseClient();
  const [onlineOthers, setOnlineOthers] = useState<OnlineOther[]>([]);

  const memberSet = useMemo(() => new Set(memberIds), [memberIds]);

  useEffect(() => {
    const channel = supabase.channel(`list:${listId}:presence`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresencePayload>();
        const others: OnlineOther[] = [];
        for (const key of Object.keys(state)) {
          if (key === currentUserId) continue;
          if (!memberSet.has(key)) continue;
          const payloads = state[key];
          const name = payloads?.[0]?.name;
          if (name) others.push({ id: key, name });
        }
        setOnlineOthers(others);
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

  const dotColor = colorMap?.get(onlineOthers[0].id) ?? FALLBACK_DOT_COLOR;

  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex size-2">
        <span
          className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
          style={{ backgroundColor: dotColor.color }}
        />
        <span
          className="relative inline-flex size-2 rounded-full"
          style={{ backgroundColor: dotColor.color }}
        />
      </span>
      {onlineOthers.length === 1
        ? t("viewingOne", { name: onlineOthers[0].name })
        : t("viewingMany", { count: onlineOthers.length })}
    </p>
  );
}
