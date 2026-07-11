"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useUser } from "@clerk/nextjs";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { DuoRings, type DuoRingsState } from "@/components/duo-rings";
import { initialsFor } from "@/components/member-avatar";

type PartnerProfile = Pick<Profile, "id" | "display_name" | "email">;

/**
 * Compact always-present app-bar affordance that mirrors the partnership
 * state machine (solo/pending/paired) via mini `DuoRings` and links to `/us`.
 * Load pattern mirrors `us-surface.tsx`'s effect, trimmed to just what the
 * chip needs to render.
 */
export function DuoChip() {
  const supabase = useSupabaseClient();
  const { user } = useUser();
  const t = useTranslations("us");

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<DuoRingsState>("solo");
  const [ownProfile, setOwnProfile] = useState<PartnerProfile | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function load() {
      try {
        const [{ data: ownRow }, { data: pid }] = await Promise.all([
          supabase.from("profiles").select("id, display_name, email").eq("id", user!.id).maybeSingle(),
          supabase.rpc("active_partnership_id"),
        ]);
        if (cancelled) return;
        setOwnProfile((ownRow as PartnerProfile) ?? null);

        if (!pid) {
          const { data } = await supabase
            .from("partner_invites")
            .select("id")
            .eq("status", "pending")
            .limit(1);
          if (cancelled) return;
          setState((data?.length ?? 0) > 0 ? "pending" : "solo");
          return;
        }

        const { data: partnerId } = await supabase.rpc("active_partner_id");
        if (cancelled) return;

        if (!partnerId) {
          setState("solo");
          return;
        }

        const { data: partnerProfile } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .eq("id", partnerId)
          .maybeSingle();
        if (cancelled) return;

        setPartner((partnerProfile as PartnerProfile) ?? null);
        setState("paired");
      } catch {
        // Chip is decorative; on failure it just stays hidden until a retry via remount.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, user, user?.id]);

  if (loading) return null;

  const yourName = ownProfile?.display_name || ownProfile?.email || t("you");
  const partnerName = partner?.display_name || partner?.email || t("partnerFallback");

  return (
    <Link
      href="/us"
      aria-label={t("chipLabel")}
      className="inline-flex shrink-0 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <DuoRings
        size={24}
        state={state}
        partnerA={{ initials: initialsFor(ownProfile), name: yourName }}
        partnerB={state === "paired" ? { initials: initialsFor(partner), name: partnerName } : undefined}
      />
    </Link>
  );
}
