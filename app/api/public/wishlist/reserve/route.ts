import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getClientKey, isRateLimited } from "@/lib/rate-limit";

const requestSchema = z.object({
  token: z.string().min(1).max(200),
  itemId: z.string().uuid(),
  guestLabel: z.string().trim().max(80).optional(),
});

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const { token, itemId, guestLabel } = parsed.data;
  const admin = getAdminClient();

  const { data, error } = await admin.rpc("reserve_public_item", {
    p_token: token,
    p_item_id: itemId,
    p_label: guestLabel ?? null,
  });

  const result = Array.isArray(data) ? data[0] : null;

  if (!error && result?.ok && result.secret) {
    return NextResponse.json({ ok: true, secret: result.secret as string });
  }

  // The RPC returns a uniform `false` for every failure case (bad token,
  // removed item, or already reserved) so it can't be probed for validity.
  // Re-reading the public wishlist here is safe — it's the same no-oracle
  // call a guest could make just by viewing the page — and lets us tell the
  // client whether to show "already reserved" vs a generic error.
  const { data: wishlistRows } = await admin.rpc("get_public_wishlist", {
    p_token: token,
    p_viewer_id: null,
  });

  const item = Array.isArray(wishlistRows)
    ? wishlistRows.find((row: { item_id: string }) => row.item_id === itemId)
    : null;

  if (item?.is_reserved) {
    return NextResponse.json({ ok: false, reason: "already_reserved" });
  }

  return NextResponse.json({ ok: false, reason: "invalid" });
}
