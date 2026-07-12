"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { DuoRingsState } from "@/components/duo-rings";

/**
 * Loads just the partnership state machine (solo/pending/paired) — the
 * `active_partnership_id` / `active_partner_id` / pending `partner_invites`
 * check mirrored from the now-deleted `duo-chip.tsx`, trimmed to drop the
 * profile/initials fetch since nav-icon consumers render no names.
 */
export function useDuoState(): { state: DuoRingsState; loading: boolean } {
  const supabase = useSupabaseClient();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<DuoRingsState>("solo");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function load() {
      try {
        const { data: pid } = await supabase.rpc("active_partnership_id");
        if (cancelled) return;

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

        setState(partnerId ? "paired" : "solo");
      } catch {
        // State stays at its last known value; consumers should fall back to a static icon on `loading`.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, user, user?.id]);

  return { state, loading };
}
