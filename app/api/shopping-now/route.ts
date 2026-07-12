import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { getApiTranslator } from "@/lib/api-translator";
import { notifyUsers } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

const shoppingNowRequestSchema = z.object({
  listId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const t = await getApiTranslator(request);
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = shoppingNowRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: t("api.invalidListId") }, { status: 400 });
  }

  const { listId } = parsed.data;

  const supabase = await createClient();
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .maybeSingle();

  // RLS scopes `lists` to members, so a miss here doubles as the membership check.
  if (!list) {
    return NextResponse.json({ error: t("api.noListAccess") }, { status: 403 });
  }

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: members } = await admin
    .from("list_members")
    .select("user_id")
    .eq("list_id", listId);

  const recipientIds = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== userId);

  if (recipientIds.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const { data: shopperProfile } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();

  const shopperName =
    shopperProfile?.display_name?.trim() || shopperProfile?.email || "Your partner";

  const { sent } = await notifyUsers({
    userIds: recipientIds,
    type: "shopping_now",
    title: t("api.shoppingNowTitle", { name: shopperName }),
    body: t("api.shoppingNowBody"),
    url: `/lists/${listId}`,
  });

  return NextResponse.json({ sent });
}
