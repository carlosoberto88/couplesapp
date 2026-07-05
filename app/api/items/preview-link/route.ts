import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { getApiTranslator } from "@/lib/api-translator";
import { hostnameFromUrl } from "@/lib/link-preview/normalize-url";
import { ensurePreviewImageStored } from "@/lib/link-preview/preview-image";
import { createPreviewToken } from "@/lib/link-preview/preview-token";
import { resolveLinkPreview } from "@/lib/link-preview/resolve-preview";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  listId: z.string().uuid(),
  url: z.string().url(),
});

export async function POST(request: NextRequest) {
  const t = await getApiTranslator(request);
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: t("api.invalidLinkPreview") }, { status: 400 });
  }

  const { listId, url } = parsed.data;

  const supabase = await createClient();
  const { data: list } = await supabase
    .from("lists")
    .select("id")
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

  const { preview } = await resolveLinkPreview(url, admin);

  if (!preview?.name) {
    return NextResponse.json({ error: t("api.linkPreviewFailed") }, { status: 422 });
  }

  const { imageStoragePath, imagePreviewUrl } = await ensurePreviewImageStored(admin, preview);

  const previewToken = createPreviewToken({
    normalizedUrl: preview.normalizedUrl,
    name: preview.name,
    price: preview.price,
    currency: preview.currency,
    imageStoragePath,
    source: preview.source,
  });

  return NextResponse.json({
    previewToken,
    name: preview.name,
    url: preview.normalizedUrl,
    price: preview.price,
    currency: preview.currency,
    imageUrl: imagePreviewUrl,
    hostname: hostnameFromUrl(preview.normalizedUrl),
    source: preview.source,
  });
}
