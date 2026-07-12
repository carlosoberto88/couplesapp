import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type DueList = {
  id: string;
  regenerate_interval_days: number;
  next_regenerate_at: string;
};

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const nowIso = new Date().toISOString();

  const { data: lists, error: listsError } = await admin
    .from("lists")
    .select("id, regenerate_interval_days, next_regenerate_at")
    .eq("recurring", true)
    .not("regenerate_interval_days", "is", null)
    .not("next_regenerate_at", "is", null)
    .lte("next_regenerate_at", nowIso);

  if (listsError) {
    console.error("[recurring-lists] failed to select due lists", listsError);
    return NextResponse.json({ processed: 0, regenerated: 0, error: true }, { status: 500 });
  }

  let processed = 0;
  let regenerated = 0;

  for (const list of (lists ?? []) as DueList[]) {
    processed++;

    if (!list.regenerate_interval_days || list.regenerate_interval_days <= 0) {
      console.error("[recurring-lists] invalid interval for list", list.id);
      continue;
    }

    try {
      // Mirrors handleFinish's recurring-list branch in shopping-item-list.tsx
      // exactly: soft-delete checked extras, un-check staples.
      const { error: extrasError } = await admin
        .from("items")
        .update({ removed_at: nowIso })
        .eq("list_id", list.id)
        .eq("is_extra", true)
        .not("checked_at", "is", null)
        .is("removed_at", null);

      const { error: staplesError } = await admin
        .from("items")
        .update({ checked_at: null, checked_by: null })
        .eq("list_id", list.id)
        .eq("is_extra", false)
        .not("checked_at", "is", null)
        .is("removed_at", null);

      if (extrasError || staplesError) {
        console.error(
          "[recurring-lists] failed to regenerate items for list",
          list.id,
          extrasError,
          staplesError,
        );
        continue;
      }

      const intervalMs = list.regenerate_interval_days * 86_400_000;
      let nextMs = new Date(list.next_regenerate_at).getTime() + intervalMs;
      const nowMs = Date.now();
      if (nextMs <= nowMs) {
        const missed = Math.ceil((nowMs - nextMs) / intervalMs);
        nextMs += missed * intervalMs;
      }

      const { error: scheduleError } = await admin
        .from("lists")
        .update({ next_regenerate_at: new Date(nextMs).toISOString() })
        .eq("id", list.id);

      if (scheduleError) {
        console.error("[recurring-lists] failed to update schedule for list", list.id, scheduleError);
        continue;
      }

      regenerated++;
    } catch (err) {
      console.error("[recurring-lists] failed for list", list.id, err);
    }
  }

  return NextResponse.json({ processed, regenerated });
}
