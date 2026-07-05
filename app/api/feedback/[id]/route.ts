import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getApiTranslator } from "@/lib/api-translator";
import { getFeedbackServiceClient, isFeedbackAdmin } from "@/lib/feedback-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const t = await getApiTranslator(request);
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });
  }

  if (!isFeedbackAdmin(userId)) {
    return NextResponse.json({ error: t("api.forbidden") }, { status: 403 });
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: t("api.invalidFeedbackId") }, { status: 400 });
  }

  const admin = getFeedbackServiceClient();
  const { data, error } = await admin
    .from("feedback_submissions")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "open")
    .select("id, status, resolved_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: t("api.feedbackResolveError") }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: t("api.feedbackNotFound") }, { status: 404 });
  }

  return NextResponse.json({ submission: data });
}
