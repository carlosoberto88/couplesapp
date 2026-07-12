import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { normalizeFeedbackRows } from "@/lib/feedback-types";
import { getApiTranslator } from "@/lib/api-translator";
import { getFeedbackServiceClient, isFeedbackAdmin } from "@/lib/feedback-admin";
import { createClient } from "@/lib/supabase/server";

const feedbackPostSchema = z.object({
  type: z.enum(["suggestion", "bug"]),
  message: z.string().trim().min(10).max(4000),
  pageUrl: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const t = await getApiTranslator(request);
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = feedbackPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: t("api.invalidFeedback") }, { status: 400 });
  }

  const { type, message, pageUrl } = parsed.data;
  const userAgent = request.headers.get("user-agent");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_submissions")
    .insert({
      user_id: userId,
      type,
      message,
      page_url: pageUrl?.trim() || null,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: t("api.feedbackSubmitError") }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

export async function GET(request: NextRequest) {
  const t = await getApiTranslator(request);
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });
  }

  if (!isFeedbackAdmin(userId)) {
    return NextResponse.json({ error: t("api.forbidden") }, { status: 403 });
  }

  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam === "resolved" || statusParam === "all" ? statusParam : "open";

  const admin = getFeedbackServiceClient();
  let query = admin
    .from("feedback_submissions")
    .select(
      "id, user_id, type, message, page_url, user_agent, status, created_at, resolved_at, profiles(email, display_name, username)",
    )
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: t("api.feedbackFetchError") }, { status: 500 });
  }

  return NextResponse.json({ submissions: normalizeFeedbackRows(data) });
}
