import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { formatItemsAddedBody } from "@/lib/format-item-push-body";
import { getApiTranslator } from "@/lib/api-translator";
import { verifyPreviewToken } from "@/lib/link-preview/preview-token";
import { notifyUsers } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import type { Item } from "@/lib/types";
import {
  buildItemImagePathFromExt,
  copyStorageObject,
  removeStorageObjects,
  uploadItemImageBuffer,
} from "@/lib/upload-item-image";

const requestSchema = z.object({
  listId: z.string().uuid(),
  previewToken: z.string().min(1),
  priority: z.enum(["must_have", "nice_to_have"]).nullable().optional(),
});

function extFromPath(path: string): "jpg" | "png" | "webp" {
  if (path.endsWith(".png")) return "png";
  if (path.endsWith(".webp")) return "webp";
  return "jpg";
}

function mimeFromExt(ext: "jpg" | "png" | "webp"): "image/jpeg" | "image/png" | "image/webp" {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function attachPreviewImage(
  admin: SupabaseClient,
  listId: string,
  itemId: string,
  userId: string,
  imageStoragePath: string | null,
): Promise<{ error?: string }> {
  if (!imageStoragePath) return {};

  const ext = extFromPath(imageStoragePath);
  const targetPath = buildItemImagePathFromExt(listId, itemId, ext);

  if (imageStoragePath.startsWith("previews/")) {
    const { error } = await copyStorageObject(admin, imageStoragePath, targetPath);
    if (error) return { error };

    const { error: insertError } = await admin.from("item_images").insert({
      item_id: itemId,
      storage_path: targetPath,
      sort_order: 0,
      created_by: userId,
    });

    if (insertError) {
      await removeStorageObjects(admin, [targetPath]);
      return { error: insertError.message };
    }

    await removeStorageObjects(admin, [imageStoragePath]);
    return {};
  }

  const { data: fileData, error: downloadError } = await admin.storage
    .from("item-images")
    .download(imageStoragePath);

  if (downloadError || !fileData) {
    return { error: downloadError?.message ?? "image_download_failed" };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { error } = await uploadItemImageBuffer(
    admin,
    listId,
    itemId,
    userId,
    buffer,
    mimeFromExt(ext),
    ext,
  );

  return error ? { error } : {};
}

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

  const payload = verifyPreviewToken(parsed.data.previewToken);
  if (!payload) {
    return NextResponse.json({ error: t("api.linkPreviewExpired") }, { status: 400 });
  }

  const { listId, priority: requestPriority } = parsed.data;

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

  const itemId = crypto.randomUUID();

  const { data: inserted, error: insertError } = await admin
    .from("items")
    .insert({
      id: itemId,
      list_id: listId,
      name: payload.name,
      note: null,
      url: payload.normalizedUrl,
      price: payload.price,
      currency: payload.price !== null ? (payload.currency ?? "USD") : null,
      priority: requestPriority ?? null,
      position: 0,
      created_by: userId,
      skip_push: true,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: t("api.fromLinkInsertError") }, { status: 500 });
  }

  const { error: imageError } = await attachPreviewImage(
    admin,
    listId,
    itemId,
    userId,
    payload.imageStoragePath,
  );

  if (imageError) {
    await admin.from("items").delete().eq("id", itemId);
    return NextResponse.json({ error: t("api.fromLinkImageError") }, { status: 500 });
  }

  const { data: members } = await admin
    .from("list_members")
    .select("user_id")
    .eq("list_id", listId);

  const recipientIds = (members ?? [])
    .map((member) => member.user_id)
    .filter((id) => id !== userId);

  if (recipientIds.length > 0) {
    const pushBody = formatItemsAddedBody([payload.name], list.name, list.type === "wishlist");
    await notifyUsers({
      userIds: recipientIds,
      type: "item_added",
      title: "Couples",
      body: pushBody,
      url: `/lists/${listId}`,
    });
  }

  return NextResponse.json({ item: inserted as Item });
}
