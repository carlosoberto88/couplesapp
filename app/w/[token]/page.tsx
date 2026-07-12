import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { auth } from "@clerk/nextjs/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

import { ITEM_IMAGE_BUCKET } from "@/lib/upload-item-image";
import {
  PublicWishlistGallery,
  type PublicWishlistItem,
} from "@/components/public-wishlist-gallery";

// Short-lived — this page is reachable by anyone with the link, so signed
// image URLs shouldn't outlive a single visit by much.
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes

type PublicWishlistRow = {
  list_name: string;
  // Sourced from coalesce(p.username, p.display_name) in get_public_wishlist
  // (0027) — never the owner's email, since this page is unauthenticated.
  owner_display_name: string | null;
  item_id: string;
  name: string;
  note: string | null;
  url: string | null;
  price: number | null;
  currency: string | null;
  priority: "must_have" | "nice_to_have" | null;
  position: number;
  created_at: string;
  is_reserved: boolean | null;
  images: string[];
};

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

// Wrapped in React's cache() so generateMetadata() and the page body share a
// single RPC call per request instead of hitting get_public_wishlist twice.
const fetchPublicWishlist = cache(
  async (token: string): Promise<PublicWishlistRow[]> => {
    const { userId } = await auth();
    const admin = getAdminClient();

    const { data, error } = await admin.rpc("get_public_wishlist", {
      p_token: token,
      p_viewer_id: userId ?? null,
    });

    // Errors are treated the same as "no rows" — no oracle for the caller to
    // distinguish a bad token from a transient failure.
    if (error || !data) return [];
    return data as PublicWishlistRow[];
  },
);

async function toPublicWishlistItems(
  admin: ReturnType<typeof getAdminClient>,
  rows: PublicWishlistRow[],
): Promise<PublicWishlistItem[]> {
  const allPaths = rows.flatMap((row) => row.images);
  const signedUrls = new Map<string, string>();

  await Promise.all(
    allPaths.map(async (path) => {
      const { data } = await admin.storage
        .from(ITEM_IMAGE_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (data?.signedUrl) signedUrls.set(path, data.signedUrl);
    }),
  );

  return rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      id: row.item_id,
      name: row.name,
      note: row.note,
      url: row.url,
      price: row.price,
      currency: row.currency,
      priority: row.priority,
      isReserved: row.is_reserved === true,
      imageUrl: row.images.length > 0 ? (signedUrls.get(row.images[0]!) ?? null) : null,
    }));
}

type PageParams = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { token } = await params;
  const [t, tMeta, rows, origin] = await Promise.all([
    getTranslations("publicWishlist"),
    getTranslations("metadata"),
    fetchPublicWishlist(token),
    getAppOrigin(),
  ]);

  const listName = rows[0]?.list_name;
  const title = listName ?? t("notAvailableTitle");
  const description = listName ? t("ogDescription", { name: listName }) : t("notAvailableBody");
  const ogImage = `${origin}/icons/icon-512.png`;

  return {
    title: `${title} — ${tMeta("title")}`,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 512, height: 512 }],
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PublicWishlistPage({ params }: PageParams) {
  const { token } = await params;
  const t = await getTranslations("publicWishlist");
  const rows = await fetchPublicWishlist(token);

  if (rows.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="font-display text-lg font-semibold text-foreground">
          {t("notAvailableTitle")}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("notAvailableBody")}</p>
      </main>
    );
  }

  const admin = getAdminClient();
  const items = await toPublicWishlistItems(admin, rows);
  const { list_name: listName, owner_display_name: ownerDisplayName } = rows[0]!;

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 px-4 pt-4 pb-8">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-lg font-semibold text-foreground">{listName}</h1>
        {ownerDisplayName && (
          <span className="text-xs text-muted-foreground">{ownerDisplayName}</span>
        )}
      </div>

      <PublicWishlistGallery token={token} items={items} />

      <p className="mt-4 text-center text-xs text-duo-coral">{t("poweredBy")}</p>
    </main>
  );
}
