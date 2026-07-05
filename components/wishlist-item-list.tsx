"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Item, ItemImage, ListMember, Profile } from "@/lib/types";
import { buildMemberColorMap, UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { upsertRow, removeRow } from "@/lib/item-list-utils";
import { deleteItemImages, getSignedImageUrls, uploadItemImages } from "@/lib/upload-item-image";
import { sortWishlistItems } from "@/lib/wishlist-utils";
import { useRealtimeItems } from "@/lib/use-realtime-items";
import { WishlistAddForm, type WishlistAddInput } from "@/components/wishlist-add-form";
import { WishlistItemRow } from "@/components/wishlist-item-row";

const UNDO_GRACE_MS = 5000;

type MemberWithProfile = ListMember & {
  profiles: Pick<Profile, "id" | "email" | "display_name"> | null;
};

type WishlistItemListProps = {
  listId: string;
  listOwnerId: string;
  currentUserId: string;
  initialItems: Item[];
  initialImages: ItemImage[];
  members: MemberWithProfile[];
};

export function WishlistItemList({
  listId,
  listOwnerId,
  currentUserId,
  initialItems,
  initialImages,
  members,
}: WishlistItemListProps) {
  const supabase = useSupabaseClient();
  const t = useTranslations("wishlist");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<Item[]>(initialItems);
  const [imagesByItemId, setImagesByItemId] = useState<Map<string, ItemImage[]>>(() => {
    const map = new Map<string, ItemImage[]>();
    for (const img of initialImages) {
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
  });
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  const [adding, setAdding] = useState(false);

  const colorMap = useMemo(() => buildMemberColorMap(members), [members]);
  const memberByUserId = useMemo(() => {
    const map = new Map<string, MemberWithProfile>();
    for (const member of members) map.set(member.user_id, member);
    return map;
  }, [members]);

  const nameFor = useCallback(
    (userId: string | null) => {
      if (!userId) return null;
      const member = memberByUserId.get(userId);
      return member?.profiles?.display_name || member?.profiles?.email || null;
    },
    [memberByUserId],
  );

  const sortedItems = useMemo(() => sortWishlistItems(items), [items]);
  const locallyRemovedIdsRef = useRef<Set<string>>(new Set());
  const handleAddRef = useRef<(input: WishlistAddInput) => void>(() => {});

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

  const handleAdd = useCallback(
    (input: WishlistAddInput) => {
      const newItem: Item = {
        id: crypto.randomUUID(),
        list_id: listId,
        name: input.name,
        note: input.note,
        url: input.url,
        price: input.price,
        currency: input.currency,
        priority: input.priority,
        position: 0,
        created_by: currentUserId,
        created_at: new Date().toISOString(),
        checked_at: null,
        checked_by: null,
        reserved_by: null,
        reserved_at: null,
      };

      setItems((prev) => upsertRow(prev, newItem));
      setAdding(true);

      void (async () => {
        const { error } = await supabase.from("items").insert({
          id: newItem.id,
          list_id: newItem.list_id,
          name: newItem.name,
          note: newItem.note,
          url: newItem.url,
          price: newItem.price,
          currency: newItem.currency,
          priority: newItem.priority,
          position: newItem.position,
          created_by: newItem.created_by,
        });

        if (error) {
          setItems((prev) => removeRow(prev, newItem.id));
          setAdding(false);
          toast.error(t("saveError"), {
            action: { label: tCommon("retry"), onClick: () => handleAddRef.current(input) },
          });
          return;
        }

        if (input.files.length > 0) {
          const { error: uploadError } = await uploadItemImages(
            supabase,
            listId,
            newItem.id,
            currentUserId,
            input.files,
          );
          if (uploadError) {
            toast.error(
              uploadError === "invalidType"
                ? t("imageInvalidType")
                : uploadError === "tooLarge"
                  ? t("imageTooLarge")
                  : t("uploadError"),
            );
          } else {
            const { data: imgs } = await supabase
              .from("item_images")
              .select("*")
              .eq("item_id", newItem.id)
              .order("sort_order");
            if (imgs) {
              setImagesByItemId((prev) => {
                const next = new Map(prev);
                next.set(newItem.id, imgs as ItemImage[]);
                return next;
              });
              await refreshSignedUrls(imgs as ItemImage[]);
            }
          }
        }

        setAdding(false);
      })();
    },
    [listId, currentUserId, supabase, t, tCommon, refreshSignedUrls],
  );

  useEffect(() => {
    handleAddRef.current = handleAdd;
  });

  const updateItem = useCallback(
    (item: Item, patch: Partial<Item>, retry: () => void) => {
      const nextItem = { ...item, ...patch };
      setItems((prev) => upsertRow(prev, nextItem));

      void (async () => {
        const { error } = await supabase.from("items").update(patch).eq("id", item.id);
        if (error) {
          setItems((prev) => upsertRow(prev, item));
          toast.error(t("saveError"), { action: { label: tCommon("retry"), onClick: retry } });
        }
      })();
    },
    [supabase, t, tCommon],
  );

  const handleReserve = useCallback(
    (item: Item) => {
      updateItem(
        item,
        { reserved_by: currentUserId, reserved_at: new Date().toISOString() },
        () => handleReserve(item),
      );
    },
    [currentUserId, updateItem],
  );

  const handleRelease = useCallback(
    (item: Item) => {
      updateItem(item, { reserved_by: null, reserved_at: null }, () => handleRelease(item));
    },
    [updateItem],
  );

  const handleMarkPurchased = useCallback(
    (item: Item) => {
      updateItem(
        item,
        { checked_at: new Date().toISOString(), checked_by: currentUserId },
        () => handleMarkPurchased(item),
      );
    },
    [currentUserId, updateItem],
  );

  const handleUnmarkPurchased = useCallback(
    (item: Item) => {
      updateItem(item, { checked_at: null, checked_by: null }, () => handleUnmarkPurchased(item));
    },
    [updateItem],
  );

  const handleUndoRemove = useCallback(
    (item: Item, images: ItemImage[], toastId: string | number) => {
      setItems((prev) => upsertRow(prev, item));
      if (images.length > 0) {
        setImagesByItemId((prev) => {
          const next = new Map(prev);
          next.set(item.id, images);
          return next;
        });
      }

      void (async () => {
        const { error } = await supabase.from("items").insert({
          id: item.id,
          list_id: item.list_id,
          name: item.name,
          note: item.note,
          url: item.url,
          price: item.price,
          currency: item.currency,
          priority: item.priority,
          position: item.position,
          created_by: item.created_by,
          checked_at: item.checked_at,
          checked_by: item.checked_by,
          reserved_by: item.reserved_by,
          reserved_at: item.reserved_at,
        });

        if (error) {
          setItems((prev) => removeRow(prev, item.id));
          toast.error(t("undoError"), {
            action: { label: tCommon("retry"), onClick: () => handleUndoRemove(item, images, toastId) },
          });
          return;
        }

        for (const img of images) {
          await supabase.from("item_images").insert(img);
        }

        toast.dismiss(toastId);
      })();
    },
    [supabase, t, tCommon],
  );

  const handleRemove = useCallback(
    (item: Item) => {
      const images = imagesByItemId.get(item.id) ?? [];
      locallyRemovedIdsRef.current.add(item.id);
      setTimeout(() => locallyRemovedIdsRef.current.delete(item.id), 3000);

      setItems((prev) => removeRow(prev, item.id));
      setImagesByItemId((prev) => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });

      void (async () => {
        await deleteItemImages(supabase, images);
        const { error } = await supabase.from("items").delete().eq("id", item.id);

        if (error) {
          setItems((prev) => upsertRow(prev, item));
          if (images.length > 0) {
            setImagesByItemId((prev) => {
              const next = new Map(prev);
              next.set(item.id, images);
              return next;
            });
          }
          toast.error(t("removeError"), {
            action: { label: tCommon("retry"), onClick: () => handleRemove(item) },
          });
          return;
        }

        const toastId = toast(t("removedGift", { name: item.name }), {
          duration: UNDO_GRACE_MS,
          action: {
            label: tCommon("undo"),
            onClick: () => handleUndoRemove(item, images, toastId),
          },
        });
      })();
    },
    [imagesByItemId, supabase, t, tCommon, handleUndoRemove],
  );

  const refetchAll = useCallback(() => {
    void (async () => {
      const { data: itemRows } = await supabase
        .from("items")
        .select("*")
        .eq("list_id", listId)
        .order("created_at");

      if (itemRows) setItems(itemRows as Item[]);

      const ids = (itemRows ?? []).map((row) => row.id);
      if (ids.length === 0) {
        setImagesByItemId(new Map());
        return;
      }

      const { data: imageRows } = await supabase
        .from("item_images")
        .select("*")
        .in("item_id", ids)
        .order("sort_order");

      if (imageRows) {
        const map = new Map<string, ItemImage[]>();
        for (const img of imageRows as ItemImage[]) {
          const list = map.get(img.item_id) ?? [];
          list.push(img);
          map.set(img.item_id, list);
        }
        setImagesByItemId(map);
        await refreshSignedUrls(imageRows as ItemImage[]);
      }
    })();
  }, [listId, supabase, refreshSignedUrls]);

  const handleRealtimeUpsert = useCallback((row: Item) => {
    setItems((prev) => upsertRow(prev, row));
  }, []);

  const handleRealtimeRemove = useCallback((id: string) => {
    setItems((prev) => removeRow(prev, id));
    setImagesByItemId((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleOtherUserAdd = useCallback(
    (row: Item) => {
      const adderName = nameFor(row.created_by);
      toast(
        adderName
          ? t("addedByOther", { name: row.name, user: adderName })
          : t("addedOther", { name: row.name }),
      );
    },
    [nameFor, t],
  );

  const handleOtherUserReserve = useCallback(
    (row: Item) => {
      if (row.reserved_by === currentUserId) return;
      toast(t("reservedByOther", { name: row.name }));
    },
    [currentUserId, t],
  );

  const handleOtherUserPurchase = useCallback(
    (row: Item) => {
      if (row.checked_by === currentUserId) return;
      toast(t("purchasedByOther", { name: row.name }));
    },
    [currentUserId, t],
  );

  const handleOtherUserRemove = useCallback(
    (row: Item) => {
      if (locallyRemovedIdsRef.current.has(row.id)) return;
      toast(t("removedByOther", { name: row.name }));
    },
    [t],
  );

  useRealtimeItems(listId, currentUserId, {
    onUpsert: handleRealtimeUpsert,
    onRemove: handleRealtimeRemove,
    onOtherUserAdd: handleOtherUserAdd,
    onOtherUserReserve: handleOtherUserReserve,
    onOtherUserPurchase: handleOtherUserPurchase,
    onOtherUserRemove: handleOtherUserRemove,
    onRefetch: refetchAll,
    wishlistMode: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`item_images:${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "item_images" },
        () => {
          void refetchAll();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [listId, supabase, refetchAll]);

  function primaryImageUrl(itemId: string): string | null {
    const imgs = imagesByItemId.get(itemId);
    if (!imgs?.length) return null;
    return signedUrls.get(imgs[0]!.storage_path) ?? null;
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <WishlistAddForm onAdd={handleAdd} pending={adding} />

      <div className="px-1">
        <span className="text-xs text-muted-foreground">
          {t("itemCount", { count: sortedItems.length })}
        </span>
      </div>

      {sortedItems.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sortedItems.map((item) => (
            <WishlistItemRow
              key={item.id}
              item={item}
              listOwnerId={listOwnerId}
              currentUserId={currentUserId}
              adderColor={colorMap.get(item.created_by) ?? UNKNOWN_MEMBER_COLOR}
              imageUrl={primaryImageUrl(item.id)}
              onReserve={handleReserve}
              onRelease={handleRelease}
              onMarkPurchased={handleMarkPurchased}
              onUnmarkPurchased={handleUnmarkPurchased}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
