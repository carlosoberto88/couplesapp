import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { formatItemsAddedBody } from "@/lib/format-item-push-body";
import { getApiTranslator } from "@/lib/api-translator";
import { sendPushToUserIds } from "@/lib/send-push";
import { createClient } from "@/lib/supabase/server";
import type { Item } from "@/lib/types";

const bulkItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  note: z.string().max(500).nullable().optional(),
  url: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  price: z.number().nonnegative().nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
  priority: z.enum(["must_have", "nice_to_have"]).nullable().optional(),
});

const bulkRequestSchema = z.object({
  listId: z.string().uuid(),
  items: z.array(bulkItemSchema).min(1).max(50),
});

export async function POST(request: NextRequest) {
  const t = await getApiTranslator(request);
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bulkRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: t("api.invalidBulkItems") }, { status: 400 });
  }

  const { listId, items: itemInputs } = parsed.data;

  const supabase = await createClient();
  const { data: list } = await supabase
    .from("lists")
    .select("id, name, type")
    .eq("id", listId)
    .maybeSingle();

  if (!list) {
    return NextResponse.json({ error: t("api.noListAccess") }, { status: 403 });
  }

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const rows = itemInputs.map((input) => ({
    id: input.id ?? crypto.randomUUID(),
    list_id: listId,
    name: input.name.trim(),
    note: input.note?.trim() || null,
    url: input.url?.trim() || null,
    price: input.price ?? null,
    currency: input.price !== null && input.price !== undefined ? (input.currency ?? "USD") : null,
    priority: input.priority ?? null,
    position: 0,
    created_by: userId,
    skip_push: true,
  }));

  const { data: inserted, error: insertError } = await admin
    .from("items")
    .insert(rows)
    .select("*");

  if (insertError || !inserted) {
    return NextResponse.json({ error: t("api.bulkInsertError") }, { status: 500 });
  }

  const { data: members } = await admin
    .from("list_members")
    .select("user_id")
    .eq("list_id", listId);

  const recipientIds = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== userId);

  if (recipientIds.length > 0) {
    const isWishlist = list.type === "wishlist";
    const pushBody = formatItemsAddedBody(
      rows.map((row) => row.name),
      list.name,
      isWishlist,
    );

    await sendPushToUserIds({
      userIds: recipientIds,
      title: "Couples",
      body: pushBody,
      url: `/lists/${listId}`,
    });
  }

  return NextResponse.json({ items: inserted as Item[] });
}
