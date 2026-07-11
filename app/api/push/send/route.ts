import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

import { formatItemsAddedBody } from "@/lib/format-item-push-body";
import { notifyUsers } from "@/lib/notify";
import { configureWebPush } from "@/lib/web-push";

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: {
    id?: string;
    list_id?: string;
    name?: string;
    created_by?: string;
    skip_push?: boolean;
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
  if (record?.skip_push === true) {
    return NextResponse.json({ ok: true, skipped: true });
  }

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
    admin.from("lists").select("name, type").eq("id", listId).maybeSingle(),
    admin.from("list_members").select("user_id").eq("list_id", listId),
  ]);

  const recipientIds = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== createdBy);

  if (recipientIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const listName = list?.name ?? "List";
  const isWishlist = list?.type === "wishlist";
  const body = formatItemsAddedBody([itemName], listName, isWishlist);

  const { sent } = await notifyUsers({
    userIds: recipientIds,
    type: "item_added",
    title: "Couples",
    body,
    url: `/lists/${listId}`,
  });

  return NextResponse.json({ ok: true, sent });
}
