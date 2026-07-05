import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

import { configureWebPush, webpush } from "@/lib/web-push";

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: {
    id?: string;
    list_id?: string;
    name?: string;
    created_by?: string;
  };
};

function verifyWebhookSecret(request: NextRequest): boolean {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  return request.headers.get("x-webhook-secret") === secret;
}

export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as WebhookPayload | null;
  if (
    !payload ||
    payload.type !== "INSERT" ||
    payload.table !== "items" ||
    payload.schema !== "public"
  ) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const record = payload.record;
  const listId = record?.list_id;
  const itemName = record?.name;
  const createdBy = record?.created_by;

  if (!listId || !itemName || !createdBy) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    configureWebPush();
  } catch {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const [{ data: list }, { data: members }] = await Promise.all([
    admin.from("lists").select("name").eq("id", listId).maybeSingle(),
    admin.from("list_members").select("user_id").eq("list_id", listId),
  ]);

  const recipientIds = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== createdBy);

  if (recipientIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", recipientIds);

  const listName = list?.name ?? "List";
  const notificationPayload = JSON.stringify({
    title: "Couples",
    body: `"${itemName}" added to ${listName}`,
    url: `/lists/${listId}`,
  });

  let sent = 0;
  const staleEndpoints: string[] = [];

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        notificationPayload,
      );
      sent++;
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : null;
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.push(sub.endpoint);
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  return NextResponse.json({ ok: true, sent });
}
