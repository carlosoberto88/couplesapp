"use client";

import { useCallback, useEffect, useState } from "react";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { ItemImage } from "@/lib/types";
import { getSignedImageUrls } from "@/lib/upload-item-image";

function buildImagesMap(images: ItemImage[]): Map<string, ItemImage[]> {
  const map = new Map<string, ItemImage[]>();
  for (const img of images) {
    const list = map.get(img.item_id) ?? [];
    list.push(img);
    map.set(img.item_id, list);
  }
  for (const [itemId, imgs] of map) {
    map.set(
      itemId,
      [...imgs].sort((a, b) => a.sort_order - b.sort_order),
    );
  }
  return map;
}

export function useCrossListItemImages(initialImages: ItemImage[]) {
  const supabase = useSupabaseClient();
  const [imagesByItemId, setImagesByItemId] = useState<Map<string, ItemImage[]>>(() =>
    buildImagesMap(initialImages),
  );
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());

  const refreshSignedUrls = useCallback(
    async (images: ItemImage[]) => {
      if (images.length === 0) return;
      const paths = images.map((img) => img.storage_path);
      const urls = await getSignedImageUrls(supabase, paths);
      setSignedUrls((prev) => {
        const next = new Map(prev);
        for (const [path, url] of urls) next.set(path, url);
        return next;
      });
    },
    [supabase],
  );

  useEffect(() => {
    void refreshSignedUrls(initialImages);
  }, [initialImages, refreshSignedUrls]);

  const refetchImages = useCallback(
    async (itemIds: string[]) => {
      if (itemIds.length === 0) {
        setImagesByItemId(new Map());
        return;
      }

      const { data: imageRows } = await supabase
        .from("item_images")
        .select("*")
        .in("item_id", itemIds)
        .order("sort_order");

      if (imageRows) {
        setImagesByItemId(buildImagesMap(imageRows as ItemImage[]));
        await refreshSignedUrls(imageRows as ItemImage[]);
      }
    },
    [supabase, refreshSignedUrls],
  );

  const primaryImageUrl = useCallback(
    (itemId: string): string | null => {
      const imgs = imagesByItemId.get(itemId);
      if (!imgs?.length) return null;
      return signedUrls.get(imgs[0]!.storage_path) ?? null;
    },
    [imagesByItemId, signedUrls],
  );

  const imageUrlsForItem = useCallback(
    (itemId: string): string[] => {
      const imgs = imagesByItemId.get(itemId) ?? [];
      return imgs
        .map((img) => signedUrls.get(img.storage_path))
        .filter((url): url is string => !!url);
    },
    [imagesByItemId, signedUrls],
  );

  return {
    imagesByItemId,
    refetchImages,
    primaryImageUrl,
    imageUrlsForItem,
  };
}
