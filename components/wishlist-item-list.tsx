"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Item, ItemImage, ListMember, Profile } from "@/lib/types";
import { buildMemberColorMap, UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { buildNewItem, insertItemWithImages } from "@/lib/persist-item";
import { useItemImages } from "@/lib/use-item-images";
import { upsertRow, removeRow } from "@/lib/item-list-utils";
import { deleteItemImages } from "@/lib/upload-item-image";
import { sortWishlistItems } from "@/lib/wishlist-utils";
import { useRealtimeItems } from "@/lib/use-realtime-items";
import { RichAddItemForm, type RichAddInput } from "@/components/rich-add-item-form";
import { WishlistItemRow } from "@/components/wishlist-item-row";
import { ItemDetailDialog } from "@/components/item-detail-dialog";

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
  const [adding, setAdding] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);

  const { imagesByItemId, refetchImages, primaryImageUrl, imageUrlsForItem } = useItemImages(
    listId,
    initialImages,
  );

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
  const handleAddRef = useRef<(input: RichAddInput) => void>(() => {});

  const handleAdd = useCallback(
    (input: RichAddInput) => {
      const newItem = buildNewItem(listId, currentUserId, input);
      setItems((prev) => upsertRow(prev, newItem));
      setAdding(true);

      void (async () => {
        const { error } = await insertItemWithImages(
          supabase,
          listId,
          currentUserId,
          newItem,
          input.files,
        );

        setAdding(false);

        if (error) {
          setItems((prev) => removeRow(prev, newItem.id));
          toast.error(
            error === "invalidType"
              ? t("imageInvalidType")
              : error === "tooLarge"
                ? t("imageTooLarge")
                : t("saveError"),
            { action: { label: tCommon("retry"), onClick: () => handleAddRef.current(input) } },
          );
          return;
        }

        if (input.files.length > 0) {
          await refetchImages(items.map((i) => i.id).concat(newItem.id));
        }
      })();
    },
    [listId, currentUserId, supabase, t, tCommon, refetchImages, items],
  );

  useEffect(() => {
    handleAddRef.current = handleAdd;
  });

  const updateItem = useCallback(
    (item: Item, patch: Partial<Item>, retry: () => void) => {
      const nextItem = { ...item, ...patch };
      setItems((prev) => upsertRow(prev, nextItem));
      setDetailItem((current) => (current?.id === item.id ? nextItem : current));

      void (async () => {
        const { error } = await supabase.from("items").update(patch).eq("id", item.id);
        if (error) {
          setItems((prev) => upsertRow(prev, item));
          setDetailItem((current) => (current?.id === item.id ? item : current));
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
      if (detailItem?.id === item.id) setDetailItem(null);

      void (async () => {
        await deleteItemImages(supabase, images);
        const { error } = await supabase.from("items").delete().eq("id", item.id);

        if (error) {
          setItems((prev) => upsertRow(prev, item));
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
    [imagesByItemId, supabase, t, tCommon, handleUndoRemove, detailItem?.id],
  );

  const refetchAll = useCallback(() => {
    void (async () => {
      const { data: itemRows } = await supabase
        .from("items")
        .select("*")
        .eq("list_id", listId)
        .order("created_at");

      if (itemRows) {
        setItems(itemRows as Item[]);
        await refetchImages((itemRows as Item[]).map((row) => row.id));
      }
    })();
  }, [listId, supabase, refetchImages]);

  useRealtimeItems(listId, currentUserId, {
    onUpsert: (row) => {
      setItems((prev) => upsertRow(prev, row));
      setDetailItem((current) => (current?.id === row.id ? row : current));
    },
    onRemove: (id) => {
      setItems((prev) => removeRow(prev, id));
      setDetailItem((current) => (current?.id === id ? null : current));
    },
    onOtherUserAdd: (row) => {
      const adderName = nameFor(row.created_by);
      toast(
        adderName
          ? t("addedByOther", { name: row.name, user: adderName })
          : t("addedOther", { name: row.name }),
      );
    },
    onOtherUserReserve: (row) => {
      if (row.reserved_by === currentUserId) return;
      toast(t("reservedByOther", { name: row.name }));
    },
    onOtherUserPurchase: (row) => {
      if (row.checked_by === currentUserId) return;
      toast(t("purchasedByOther", { name: row.name }));
    },
    onOtherUserRemove: (row) => {
      if (locallyRemovedIdsRef.current.has(row.id)) return;
      toast(t("removedByOther", { name: row.name }));
    },
    onRefetch: refetchAll,
    wishlistMode: true,
  });

  const detailImages = detailItem ? imagesByItemId.get(detailItem.id) ?? [] : [];

  return (
    <div className="flex flex-1 flex-col gap-3">
      <RichAddItemForm listType="wishlist" onAdd={handleAdd} pending={adding} />

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
              hasImages={(imagesByItemId.get(item.id)?.length ?? 0) > 0}
              onOpenDetail={setDetailItem}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}

      <ItemDetailDialog
        item={detailItem}
        open={detailItem !== null}
        onOpenChange={(open) => !open && setDetailItem(null)}
        listId={listId}
        listType="wishlist"
        listOwnerId={listOwnerId}
        currentUserId={currentUserId}
        imageUrls={detailItem ? imageUrlsForItem(detailItem.id) : []}
        imageCount={detailImages.length}
        adderName={detailItem ? nameFor(detailItem.created_by) : null}
        checkerColor={
          detailItem?.checked_by
            ? colorMap.get(detailItem.checked_by) ?? UNKNOWN_MEMBER_COLOR
            : null
        }
        onReserve={handleReserve}
        onRelease={handleRelease}
        onMarkPurchased={handleMarkPurchased}
        onUnmarkPurchased={handleUnmarkPurchased}
        onRemove={handleRemove}
        onPhotosAdded={() => void refetchImages(items.map((i) => i.id))}
      />
    </div>
  );
}
