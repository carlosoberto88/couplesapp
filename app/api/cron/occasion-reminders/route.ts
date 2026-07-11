import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

import { getApiTranslator } from "@/lib/api-translator";
import { daysUntilOccasion, isReminderDay } from "@/lib/occasion-utils";
import { notifyUsers } from "@/lib/notify";
import type { Occasion } from "@/lib/types";

type OccasionWithPartnership = Occasion & {
  partnerships: { user_low: string; user_high: string } | null;
};

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t = await getApiTranslator(request);

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: occasions } = await admin
    .from("occasions")
    .select("*, partnerships!inner(user_low, user_high, status)")
    .eq("partnerships.status", "active");

  let processed = 0;
  let remindersSent = 0;
  let pushesSent = 0;

  for (const occasion of (occasions ?? []) as OccasionWithPartnership[]) {
    processed++;

    try {
      const partnership = occasion.partnerships;
      if (!partnership) continue;

      const days = daysUntilOccasion(occasion.occasion_date, occasion.recurring);
      if (!isReminderDay(days)) continue;

      const recipientIds = [partnership.user_low, partnership.user_high].filter(
        (id) => id !== occasion.celebrant_user_id,
      );
      if (recipientIds.length === 0) continue;

      // Re-validate list membership here rather than trusting occasion_linked_list_valid
      // at insert time — the cron is service-role (bypasses RLS) and membership can
      // change after the link was created. Gift names are only ever included when
      // BOTH partnership members are still current list_members for linked_list_id.
      let ideas: string[] = [];
      if (occasion.linked_list_id) {
        const { data: members } = await admin
          .from("list_members")
          .select("user_id")
          .eq("list_id", occasion.linked_list_id)
          .in("user_id", [partnership.user_low, partnership.user_high]);

        const memberIds = new Set((members ?? []).map((m) => m.user_id));
        const bothStillMembers =
          memberIds.has(partnership.user_low) && memberIds.has(partnership.user_high);

        if (bothStillMembers) {
          const { data: items } = await admin
            .from("items")
            .select("name")
            .eq("list_id", occasion.linked_list_id)
            .is("removed_at", null)
            .is("checked_at", null)
            .is("reserved_by", null)
            .limit(3);

          ideas = (items ?? []).map((item) => item.name);
        }
      }

      const body =
        ideas.length > 0
          ? t("occasion.reminderBodyWithIdeas", {
              label: occasion.label,
              days,
              ideas: ideas.join(", "),
            })
          : t("occasion.reminderBody", { label: occasion.label, days });

      remindersSent++;

      const { sent } = await notifyUsers({
        userIds: recipientIds,
        type: "occasion_reminder",
        title: "Couples",
        body,
        url: "/dates",
      });

      pushesSent += sent;
    } catch (err) {
      console.error("[occasion-reminders] failed for occasion", occasion.id, err);
    }
  }

  return NextResponse.json({ processed, remindersSent, pushesSent });
}
