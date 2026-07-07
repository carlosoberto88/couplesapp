import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getClientKey, isRateLimited } from "@/lib/rate-limit";

const requestSchema = z.object({
  itemId: z.string().uuid(),
  secret: z.string().min(1).max(200),
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
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { itemId, secret } = parsed.data;
  const admin = getAdminClient();

  const { data, error } = await admin.rpc("release_public_item", {
    p_item_id: itemId,
    p_secret: secret,
  });

  // Generic boolean either way — doesn't distinguish wrong-secret from
  // not-found, mirroring the RPC itself.
  return NextResponse.json({ ok: !error && data === true });
}
