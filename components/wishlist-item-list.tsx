"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Item, ItemImage, ItemPriority, ListMember, Profile } from "@/lib/types";
import { buildMemberColorMap, UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { type ItemUpdatePatch } from "@/lib/item-mutations";
import { buildNewItem, insertItemFromLink, insertItemWithImages, insertItemsBulk } from "@/lib/persist-item";
import type { LinkPreviewData } from "@/lib/persist-item";
import { useItemImages } from "@/lib/use-item-images";
import { upsertRow, removeRow } from "@/lib/item-list-utils";
import { sortWishlistItems } from "@/lib/wishlist-utils";
import { useRealtimeItems } from "@/lib/use-realtime-items";
import { createOtherUserAddToastDebouncer } from "@/lib/debounce-toasts";
import type { RichAddInput } from "@/components/rich-add-item-form";
import { ListAddSection } from "@/components/list-add-section";
import { EmptyState } from "@/components/empty-state";
import { ListActivityStrip } from "@/components/list-activity-strip";
import { PartnerPresence } from "@/components/partner-presence";
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
  listShareToken: string | null;
  initialItems: Item[];
  initialImages: ItemImage[];
  members: MemberWithProfile[];
};

export function WishlistItemList({
  listId,
  listOwnerId,
  currentUserId,
  listShareToken,
  initialItems,
  initialImages,
  members,
}: WishlistItemListProps) {
  const supabase = useSupabaseClient();
  const t = useTranslations("wishlist");
  const tBulk = useTranslations("bulkAdd");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<Item[]>(initialItems);
  const [adding, setAdding] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

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
  const memberIds = useMemo(() => members.map((m) => m.user_id), [members]);
  const myDisplayName = nameFor(currentUserId) ?? "You";
  const locallyRemovedIdsRef = useRef<Set<string>>(new Set());
  const handleRichAddRef = useRef<(input: RichAddInput) => void>(() => {});

  const handleRichAdd = useCallback(
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
            { action: { label: tCommon("retry"), onClick: () => handleRichAddRef.current(input) } },
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
    handleRichAddRef.current = handleRichAdd;
  });

  const handleAddFromLink = useCallback(
    async (
      previewToken: string,
      preview: LinkPreviewData,
      priority: ItemPriority | null,
    ): Promise<boolean> => {
      const optimisticItem: Item = {
        id: crypto.randomUUID(),
        list_id: listId,
        name: preview.name,
        note: null,
        url: preview.url,
        price: preview.price,
        currency: preview.price !== null ? (preview.currency ?? "USD") : null,
        priority,
        position: 0,
        aisle: null,
        created_by: currentUserId,
        created_at: new Date().toISOString(),
        checked_at: null,
        checked_by: null,
        reserved_by: null,
        reserved_at: null,
        is_extra: false,
        removed_at: null,
      };

      setItems((prev) => upsertRow(prev, optimisticItem));
      setAdding(true);

      const { item, error } = await insertItemFromLink(listId, previewToken, priority);

      setAdding(false);

      if (error || !item) {
        setItems((prev) => removeRow(prev, optimisticItem.id));
        toast.error(t("saveError"), {
          action: {
            label: tCommon("retry"),
            onClick: () => void handleAddFromLink(previewToken, preview, priority),
          },
        });
        return false;
      }

      setItems((prev) => {
        const withoutOptimistic = removeRow(prev, optimisticItem.id);
        return upsertRow(withoutOptimistic, item);
      });
      await refetchImages([...items.map((entry) => entry.id), item.id]);
      return true;
    },
    [listId, currentUserId, t, tCommon, refetchImages, items],
  );

  const handleBulkAdd = useCallback(
    (inputs: RichAddInput[]) => {
      const validInputs = inputs.filter((input) => input.name.trim().length > 0);
      if (validInputs.length === 0) return;

      const newItems = validInputs.map((input) => buildNewItem(listId, currentUserId, input));
      setItems((prev) => {
        let next = prev;
        for (const item of newItems) next = upsertRow(next, item);
        return next;
      });
      setAdding(true);

      void (async () => {
        const { items: savedItems, error } = await insertItemsBulk(
          supabase,
          listId,
          currentUserId,
          validInputs,
          newItems,
        );

        setAdding(false);

        if (error) {
          setItems((prev) => {
            let next = prev;
            for (const item of newItems) next = removeRow(next, item.id);
            return next;
          });
          toast.error(
            error === "invalidType"
              ? t("imageInvalidType")
              : error === "tooLarge"
                ? t("imageTooLarge")
                : t("saveError"),
          );
          return;
        }

        if (savedItems) {
          setItems((prev) => {
            let next = prev;
            for (const item of savedItems) next = upsertRow(next, item);
            return next;
          });
        }

        toast.success(tBulk("addedToast", { count: validInputs.length }));

        const itemIds = (savedItems ?? newItems).map((item) => item.id);
        if (validInputs.some((input) => input.files.length > 0)) {
          await refetchImages(items.map((i) => i.id).concat(itemIds));
        }
      })();
    },
    [listId, currentUserId, supabase, t, tBulk, refetchImages, items],
  );

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
      const nextItem = {
        ...item,
        reserved_by: currentUserId,
        reserved_at: new Date().toISOString(),
      };
      setItems((prev) => upsertRow(prev, nextItem));
      setDetailItem((current) => (current?.id === item.id ? nextItem : current));

      void (async () => {
        const { data, error } = await supabase.rpc("reserve_item_as_member", {
          p_item_id: item.id,
        });

        if (error || !data) {
          setItems((prev) => upsertRow(prev, item));
          setDetailItem((current) => (current?.id === item.id ? item : current));

          if (!error) {
            toast(t("reservedByOther", { name: item.name }));
          } else {
            toast.error(t("saveError"), {
              action: { label: tCommon("retry"), onClick: () => handleReserve(item) },
            });
          }
        }
      })();
    },
    [currentUserId, supabase, t, tCommon],
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

  const handleEdit = useCallback(
    (item: Item, patch: ItemUpdatePatch) => {
      updateItem(item, patch, () => handleEdit(item, patch));
    },
    [updateItem],
  );

  const handleUndoRemove = useCallback(
    (item: Item, toastId: string | number) => {
      setItems((prev) => upsertRow(prev, item));

      void (async () => {
        const { error } = await supabase
          .from("items")
          .update({ removed_at: null })
          .eq("id", item.id);

        if (error) {
          setItems((prev) => removeRow(prev, item.id));
          toast.error(t("undoError"), {
            action: { label: tCommon("retry"), onClick: () => handleUndoRemove(item, toastId) },
          });
          return;
        }

        toast.dismiss(toastId);
      })();
    },
    [supabase, t, tCommon],
  );

  const handleRemove = useCallback(
    (item: Item) => {
      locallyRemovedIdsRef.current.add(item.id);
      setTimeout(() => locallyRemovedIdsRef.current.delete(item.id), 3000);

      setItems((prev) => removeRow(prev, item.id));
      if (detailItem?.id === item.id) setDetailItem(null);

      void (async () => {
        const { error } = await supabase
          .from("items")
          .update({ removed_at: new Date().toISOString() })
          .eq("id", item.id);

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
            onClick: () => handleUndoRemove(item, toastId),
          },
        });
      })();
    },
    [supabase, t, tCommon, handleUndoRemove, detailItem?.id],
  );

  const refetchAll = useCallback(() => {
    void (async () => {
      const { data: itemRows } = await supabase
        .from("items")
        .select("*")
        .eq("list_id", listId)
        .is("removed_at", null)
        .order("created_at");

      if (itemRows) {
        setItems(itemRows as Item[]);
        await refetchImages((itemRows as Item[]).map((row) => row.id));
      }
    })();
  }, [listId, supabase, refetchImages]);

  const otherUserAddToastRef = useRef(
    createOtherUserAddToastDebouncer(
      (message) => toast(message),
      (userId) => nameFor(userId),
      (name, user) => (user ? t("addedByOther", { name, user }) : t("addedOther", { name })),
      (count, user) =>
        user ? t("addedByOtherBulk", { count, user }) : t("addedOtherBulk", { count }),
    ),
  );

  useEffect(() => {
    otherUserAddToastRef.current = createOtherUserAddToastDebouncer(
      (message) => toast(message),
      (userId) => nameFor(userId),
      (name, user) => (user ? t("addedByOther", { name, user }) : t("addedOther", { name })),
      (count, user) =>
        user ? t("addedByOtherBulk", { count, user }) : t("addedOtherBulk", { count }),
    );
  }, [nameFor, t]);

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
      otherUserAddToastRef.current(row.created_by, row.name);
    },
    onOtherUserReserve: (row) => {
      if (row.reserved_by === currentUserId) return;
      if (currentUserId === listOwnerId) return;
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
    <div className="flex flex-1 flex-col gap-3 pb-sticky-add-bar md:pb-0">
      <PartnerPresence
        listId={listId}
        currentUserId={currentUserId}
        displayName={myDisplayName}
        memberIds={memberIds}
        colorMap={colorMap}
      />

      <ListActivityStrip items={items} nameFor={nameFor} />

      <ListAddSection
        listId={listId}
        listType="wishlist"
        pending={adding}
        currentItemNames={items.map((item) => item.name)}
        showUsualItems
        showSmartAdd
        isOwner={currentUserId === listOwnerId}
        shareToken={listShareToken}
        onRichAdd={handleRichAdd}
        onQuickAdd={(name) =>
          handleRichAdd({
            name,
            note: null,
            url: null,
            files: [],
            price: null,
            currency: "USD",
            priority: null,
          })
        }
        onBulkAdd={handleBulkAdd}
        onAddFromLink={handleAddFromLink}
        onSmartAddBulk={(simpleItems) =>
          handleBulkAdd(
            simpleItems.map((item) => ({
              name: item.name,
              note: item.note,
              url: null,
              files: [],
              price: null,
              currency: "USD",
              priority: null,
            })),
          )
        }
        bulkOpen={bulkOpen}
        onBulkOpenChange={setBulkOpen}
        addOpen={addOpen}
        onAddOpenChange={setAddOpen}
      />

      <div className="px-1">
        <span className="text-xs text-muted-foreground">
          {t("itemCount", { count: sortedItems.length })}
        </span>
      </div>

      {sortedItems.length === 0 ? (
        <EmptyState
          icon="🎁"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          actionLabel={t("emptyAction")}
          onAction={() => setAddOpen(true)}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4">
          {sortedItems.map((item) => (
            <WishlistItemRow
              key={item.id}
              item={item}
              listOwnerId={listOwnerId}
              currentUserId={currentUserId}
              adderColor={colorMap.get(item.created_by) ?? UNKNOWN_MEMBER_COLOR}
              checkerColor={
                item.checked_by ? colorMap.get(item.checked_by) ?? UNKNOWN_MEMBER_COLOR : null
              }
              imageUrl={primaryImageUrl(item.id)}
              hasImages={(imagesByItemId.get(item.id)?.length ?? 0) > 0}
              onOpenDetail={setDetailItem}
              onRemove={handleRemove}
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
        listId={listId}
        listType="wishlist"
        listOwnerId={listOwnerId}
        currentUserId={currentUserId}
        imageUrls={detailItem ? imageUrlsForItem(detailItem.id) : []}
        imageCount={detailImages.length}
        existingImages={detailImages}
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
        onSave={handleEdit}
        onPhotosAdded={() => void refetchImages(items.map((i) => i.id))}
        onImageRemoved={() => void refetchImages(items.map((i) => i.id))}
      />
    </div>
  );
}
