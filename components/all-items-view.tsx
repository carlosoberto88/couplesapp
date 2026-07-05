"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { Item, ItemImage, ItemListContext, ItemWithList, ListMember, Profile } from "@/lib/types";
import { isWishlist } from "@/lib/list-types";
import {
  filterByStatus,
  removeItemWithList,
  sortAllItems,
  upsertItemWithList,
  type AllItemsStatus,
} from "@/lib/all-items-utils";
import {
  buildMarkPurchasedPatch,
  buildReleasePatch,
  buildReservePatch,
  buildToggleCheckedPatch,
  buildUnmarkPurchasedPatch,
  updateItemFields,
} from "@/lib/item-mutations";
import { buildMemberColorMap, UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { useSupabaseClient } from "@/lib/supabase/client";
import { useCrossListItemImages } from "@/lib/use-cross-list-item-images";
import { useRealtimeAllItems } from "@/lib/use-realtime-all-items";
import { deleteItemImages } from "@/lib/upload-item-image";
import { AllItemsRow } from "@/components/all-items-row";
import { ItemDetailDialog } from "@/components/item-detail-dialog";
import { EmptyState } from "@/components/empty-state";

type MemberWithProfile = ListMember & {
  profiles: Pick<Profile, "id" | "email" | "display_name"> | null;
};

type AllItemsViewProps = {
  currentUserId: string;
  initialItems: ItemWithList[];
  initialImages: ItemImage[];
  membersByListId: Record<string, MemberWithProfile[]>;
  status: AllItemsStatus;
};

export function AllItemsView({
  currentUserId,
  initialItems,
  initialImages,
  membersByListId,
  status,
}: AllItemsViewProps) {
  const supabase = useSupabaseClient();
  const t = useTranslations("allItems");
  const tItems = useTranslations("items");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<ItemWithList[]>(initialItems);
  const [detailItem, setDetailItem] = useState<ItemWithList | null>(null);

  const listsById = useMemo(() => {
    const map = new Map<string, ItemListContext>();
    for (const item of initialItems) {
      map.set(item.lists.id, item.lists);
    }
    for (const item of items) {
      map.set(item.lists.id, item.lists);
    }
    return map;
  }, [initialItems, items]);

  const wishlistItemIds = useMemo(
    () => items.filter((item) => isWishlist(item.lists.type)).map((item) => item.id),
    [items],
  );

  const { imagesByItemId, refetchImages, primaryImageUrl, imageUrlsForItem } =
    useCrossListItemImages(initialImages);

  const visibleItems = useMemo(
    () => sortAllItems(filterByStatus(items, status), status),
    [items, status],
  );

  const getMembers = useCallback(
    (listId: string) => membersByListId[listId] ?? [],
    [membersByListId],
  );

  const getMemberMaps = useCallback(
    (listId: string) => {
      const members = getMembers(listId);
      const colorMap = buildMemberColorMap(members);
      const memberByUserId = new Map(members.map((member) => [member.user_id, member]));
      return { colorMap, memberByUserId };
    },
    [getMembers],
  );

  const updateItem = useCallback(
    (item: ItemWithList, patch: Partial<ItemWithList>, retry: () => void) => {
      const nextItem = { ...item, ...patch };
      setItems((prev) => upsertItemWithList(prev, nextItem));
      setDetailItem((current) => (current?.id === item.id ? nextItem : current));

      void (async () => {
        const { error } = await updateItemFields(supabase, item.id, patch);
        if (error) {
          setItems((prev) => upsertItemWithList(prev, item));
          setDetailItem((current) => (current?.id === item.id ? item : current));
          toast.error(tItems("saveError"), {
            action: { label: tCommon("retry"), onClick: retry },
          });
        }
      })();
    },
    [supabase, tItems, tCommon],
  );

  const handleToggleRef = useRef<(item: ItemWithList) => void>(() => {});
  const handleReserveRef = useRef<(item: ItemWithList) => void>(() => {});
  const handleReleaseRef = useRef<(item: ItemWithList) => void>(() => {});
  const handleMarkPurchasedRef = useRef<(item: ItemWithList) => void>(() => {});
  const handleUnmarkPurchasedRef = useRef<(item: ItemWithList) => void>(() => {});
  const handleRemoveRef = useRef<(item: ItemWithList) => void>(() => {});

  const handleToggle = useCallback(
    (item: ItemWithList) => {
      const patch = buildToggleCheckedPatch(item, currentUserId);
      updateItem(item, patch, () => handleToggleRef.current(item));
    },
    [currentUserId, updateItem],
  );

  const handleReserve = useCallback(
    (item: ItemWithList) => {
      updateItem(item, buildReservePatch(currentUserId), () => handleReserveRef.current(item));
    },
    [currentUserId, updateItem],
  );

  const handleRelease = useCallback(
    (item: ItemWithList) => {
      updateItem(item, buildReleasePatch(), () => handleReleaseRef.current(item));
    },
    [updateItem],
  );

  const handleMarkPurchased = useCallback(
    (item: ItemWithList) => {
      updateItem(
        item,
        buildMarkPurchasedPatch(currentUserId),
        () => handleMarkPurchasedRef.current(item),
      );
    },
    [currentUserId, updateItem],
  );

  const handleUnmarkPurchased = useCallback(
    (item: ItemWithList) => {
      updateItem(
        item,
        buildUnmarkPurchasedPatch(),
        () => handleUnmarkPurchasedRef.current(item),
      );
    },
    [updateItem],
  );

  const handleRemove = useCallback(
    (item: ItemWithList) => {
      const images = imagesByItemId.get(item.id) ?? [];
      setItems((prev) => removeItemWithList(prev, item.id));
      if (detailItem?.id === item.id) setDetailItem(null);

      void (async () => {
        await deleteItemImages(supabase, images);
        const { error } = await supabase.from("items").delete().eq("id", item.id);

        if (error) {
          setItems((prev) => upsertItemWithList(prev, item));
          toast.error(tItems("removeError"), {
            action: { label: tCommon("retry"), onClick: () => handleRemoveRef.current(item) },
          });
          return;
        }

        toast(tItems("removedItem", { name: item.name }));
      })();
    },
    [imagesByItemId, supabase, tItems, tCommon, detailItem?.id],
  );

  useEffect(() => {
    handleToggleRef.current = handleToggle;
    handleReserveRef.current = handleReserve;
    handleReleaseRef.current = handleRelease;
    handleMarkPurchasedRef.current = handleMarkPurchased;
    handleUnmarkPurchasedRef.current = handleUnmarkPurchased;
    handleRemoveRef.current = handleRemove;
  });

  const wrapItemHandler = useCallback(
    (handler: (item: ItemWithList) => void) =>
      (item: Item) => {
        const full = items.find((row) => row.id === item.id);
        if (full) handler(full);
      },
    [items],
  );

  const refetchAll = useCallback(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*, lists!inner(id, name, type, owner_id, archived_at)")
        .is("lists.archived_at", null)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setItems(data as ItemWithList[]);
        const wishlistIds = (data as ItemWithList[])
          .filter((item) => isWishlist(item.lists.type))
          .map((item) => item.id);
        if (wishlistIds.length > 0) {
          await refetchImages(wishlistIds);
        }
      }
    })();
  }, [supabase, refetchImages]);

  useRealtimeAllItems({
    currentUserId,
    listsById,
    handlers: {
      onUpsert: (row) => setItems((prev) => upsertItemWithList(prev, row)),
      onRemove: (id) => setItems((prev) => removeItemWithList(prev, id)),
      onRefetch: refetchAll,
    },
  });

  const detailMaps = detailItem ? getMemberMaps(detailItem.list_id) : null;
  const detailAdderName = detailItem
    ? detailMaps?.memberByUserId.get(detailItem.created_by)?.profiles?.display_name ||
      detailMaps?.memberByUserId.get(detailItem.created_by)?.profiles?.email ||
      null
    : null;
  const detailCheckerColor = detailItem?.checked_by
    ? detailMaps?.colorMap.get(detailItem.checked_by) ?? UNKNOWN_MEMBER_COLOR
    : null;

  return (
    <>
      {visibleItems.length === 0 ? (
        <EmptyState
          icon={status === "pending" ? "✅" : "📋"}
          title={status === "pending" ? t("emptyPendingTitle") : t("emptyDoneTitle")}
          description={
            status === "pending" ? t("emptyPendingDescription") : t("emptyDoneDescription")
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleItems.map((item) => (
            <AllItemsRow
              key={item.id}
              item={item}
              currentUserId={currentUserId}
              imageUrl={primaryImageUrl(item.id)}
              hasImages={(imagesByItemId.get(item.id)?.length ?? 0) > 0}
              onToggle={handleToggle}
              onOpenDetail={setDetailItem}
              onReserve={handleReserve}
              onRelease={handleRelease}
              onMarkPurchased={handleMarkPurchased}
              onUnmarkPurchased={handleUnmarkPurchased}
            />
          ))}
        </ul>
      )}

      <ItemDetailDialog
        item={detailItem}
        open={detailItem !== null}
        onOpenChange={(open) => !open && setDetailItem(null)}
        listId={detailItem?.list_id ?? ""}
        listType={detailItem?.lists.type ?? "other"}
        listOwnerId={detailItem?.lists.owner_id ?? ""}
        currentUserId={currentUserId}
        imageUrls={detailItem ? imageUrlsForItem(detailItem.id) : []}
        imageCount={detailItem ? (imagesByItemId.get(detailItem.id)?.length ?? 0) : 0}
        adderName={detailAdderName}
        checkerColor={detailCheckerColor}
        onToggle={
          detailItem && !isWishlist(detailItem.lists.type)
            ? wrapItemHandler(handleToggle)
            : undefined
        }
        onRemove={detailItem ? wrapItemHandler(handleRemove) : undefined}
        onReserve={
          detailItem && isWishlist(detailItem.lists.type)
            ? wrapItemHandler(handleReserve)
            : undefined
        }
        onRelease={
          detailItem && isWishlist(detailItem.lists.type)
            ? wrapItemHandler(handleRelease)
            : undefined
        }
        onMarkPurchased={
          detailItem && isWishlist(detailItem.lists.type)
            ? wrapItemHandler(handleMarkPurchased)
            : undefined
        }
        onUnmarkPurchased={
          detailItem && isWishlist(detailItem.lists.type)
            ? wrapItemHandler(handleUnmarkPurchased)
            : undefined
        }
        onPhotosAdded={() => void refetchImages(wishlistItemIds)}
      />
    </>
  );
}
