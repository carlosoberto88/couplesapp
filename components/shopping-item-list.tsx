"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Item, ItemImage, ListMember, Profile } from "@/lib/types";
import { buildMemberColorMap, UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { type ItemUpdatePatch } from "@/lib/item-mutations";
import { buildNewItem, insertItemWithImages, insertItemsBulk } from "@/lib/persist-item";
import { useItemImages } from "@/lib/use-item-images";
import { deleteItemImages } from "@/lib/upload-item-image";
import { Button } from "@/components/ui/button";
import type { RichAddInput } from "@/components/rich-add-item-form";
import { ListAddSection } from "@/components/list-add-section";
import { EmptyState } from "@/components/empty-state";
import { AllDoneCelebration } from "@/components/all-done-celebration";
import { ListActivityStrip } from "@/components/list-activity-strip";
import { PartnerPresence } from "@/components/partner-presence";
import { CheckedItemsSection } from "@/components/checked-items-section";
import { useRealtimeItems } from "@/lib/use-realtime-items";
import { ItemRow } from "@/components/item-row";
import { ItemDetailDialog } from "@/components/item-detail-dialog";
import { sortItems, upsertRow, removeRow } from "@/lib/item-list-utils";
import { createOtherUserAddToastDebouncer } from "@/lib/debounce-toasts";

const UNDO_GRACE_MS = 5000;

type MemberWithProfile = ListMember & {
  profiles: Pick<Profile, "id" | "email" | "display_name"> | null;
};

type ShoppingItemListProps = {
  listId: string;
  listType: string;
  listOwnerId: string;
  currentUserId: string;
  initialItems: Item[];
  initialImages: ItemImage[];
  members: MemberWithProfile[];
};

export function ShoppingItemList({
  listId,
  listType,
  listOwnerId,
  currentUserId,
  initialItems,
  initialImages,
  members,
}: ShoppingItemListProps) {
  const supabase = useSupabaseClient();
  const t = useTranslations("items");
  const tBulk = useTranslations("bulkAdd");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<Item[]>(initialItems);
  const [adding, setAdding] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const prevAllCheckedRef = useRef(false);

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

  const memberIds = useMemo(() => members.map((m) => m.user_id), [members]);
  const myDisplayName = nameFor(currentUserId) ?? "You";

  const sortedItems = useMemo(() => sortItems(items), [items]);
  const uncheckedItems = useMemo(
    () => sortedItems.filter((item) => item.checked_at === null),
    [sortedItems],
  );
  const checkedItemsList = useMemo(
    () => sortedItems.filter((item) => item.checked_at !== null),
    [sortedItems],
  );
  const hasChecked = checkedItemsList.length > 0;
  const allChecked =
    sortedItems.length > 0 && hasChecked && uncheckedItems.length === 0;

  useEffect(() => {
    if (allChecked && !prevAllCheckedRef.current) {
      setCelebrate(true);
      navigator.vibrate?.(40);
    }
    prevAllCheckedRef.current = allChecked;
  }, [allChecked]);

  const handleRichAddRef = useRef<(input: RichAddInput) => void>(() => {});
  const handleToggleCheckedRef = useRef<(item: Item) => void>(() => {});
  const handleRemoveRef = useRef<(item: Item) => void>(() => {});
  const handleUndoRemoveRef = useRef<(item: Item, toastId: string | number) => void>(() => {});
  const handleClearCheckedRef = useRef<() => void>(() => {});
  const handleEditRef = useRef<(item: Item, patch: ItemUpdatePatch) => void>(() => {});
  const locallyRemovedIdsRef = useRef<Set<string>>(new Set());

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
          const message =
            error === "invalidType"
              ? t("imageInvalidType")
              : error === "tooLarge"
                ? t("imageTooLarge")
                : t("saveError");
          toast.error(message, {
            action: { label: tCommon("retry"), onClick: () => handleRichAddRef.current(input) },
          });
          return;
        }

        if (input.files.length > 0) {
          await refetchImages(items.map((i) => i.id).concat(newItem.id));
        }
      })();
    },
    [listId, currentUserId, supabase, t, tCommon, refetchImages, items],
  );

  const handleQuickAdd = useCallback(
    (name: string, note: string | null = null) => {
      handleRichAdd({
        name,
        note,
        url: null,
        files: [],
        price: null,
        currency: "USD",
        priority: null,
      });
    },
    [handleRichAdd],
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
          const message =
            error === "invalidType"
              ? t("imageInvalidType")
              : error === "tooLarge"
                ? t("imageTooLarge")
                : t("saveError");
          toast.error(message);
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

  const handleSmartAddBulk = useCallback(
    (simpleItems: { name: string; note: string | null }[]) => {
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
      );
    },
    [handleBulkAdd],
  );

  const handleToggleChecked = useCallback(
    (item: Item) => {
      const wasChecked = item.checked_at !== null;
      const nextItem: Item = wasChecked
        ? { ...item, checked_at: null, checked_by: null }
        : { ...item, checked_at: new Date().toISOString(), checked_by: currentUserId };

      setItems((prev) => upsertRow(prev, nextItem));
      setDetailItem((current) => (current?.id === item.id ? nextItem : current));

      void (async () => {
        const { error } = await supabase
          .from("items")
          .update({ checked_at: nextItem.checked_at, checked_by: nextItem.checked_by })
          .eq("id", item.id);

        if (error) {
          setItems((prev) => upsertRow(prev, item));
          setDetailItem((current) => (current?.id === item.id ? item : current));
          toast.error(t("saveError"), {
            action: { label: tCommon("retry"), onClick: () => handleToggleCheckedRef.current(item) },
          });
        }
      })();
    },
    [currentUserId, supabase, t, tCommon],
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
          toast.error(t("saveError"), {
            action: { label: tCommon("retry"), onClick: retry },
          });
        }
      })();
    },
    [supabase, t, tCommon],
  );

  const handleEdit = useCallback(
    (item: Item, patch: ItemUpdatePatch) => {
      updateItem(item, patch, () => handleEditRef.current(item, patch));
    },
    [updateItem],
  );

  const handleUndoRemove = useCallback((item: Item, toastId: string | number) => {
    setItems((prev) => upsertRow(prev, item));

    void (async () => {
      const { error } = await supabase.from("items").insert({
        id: item.id,
        list_id: item.list_id,
        name: item.name,
        note: item.note,
        url: item.url,
        position: item.position,
        created_by: item.created_by,
        checked_at: item.checked_at,
        checked_by: item.checked_by,
        reserved_by: item.reserved_by,
        reserved_at: item.reserved_at,
        price: item.price,
        currency: item.currency,
        priority: item.priority,
      });

      if (error) {
        setItems((prev) => removeRow(prev, item.id));
        toast.error(t("undoError"), {
          action: { label: tCommon("retry"), onClick: () => handleUndoRemoveRef.current(item, toastId) },
        });
        return;
      }

      toast.dismiss(toastId);
    })();
  }, [supabase, t, tCommon]);

  const handleRemove = useCallback((item: Item) => {
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
          action: { label: tCommon("retry"), onClick: () => handleRemoveRef.current(item) },
        });
        return;
      }

      const toastId = toast(t("removedItem", { name: item.name }), {
        duration: UNDO_GRACE_MS,
        action: {
          label: tCommon("undo"),
          onClick: () => handleUndoRemoveRef.current(item, toastId),
        },
      });
    })();
  }, [imagesByItemId, supabase, t, tCommon, detailItem?.id]);

  const handleClearChecked = useCallback(() => {
    const checkedItems = items.filter((item) => item.checked_at !== null);
    if (checkedItems.length === 0) return;

    for (const item of checkedItems) {
      locallyRemovedIdsRef.current.add(item.id);
    }
    setTimeout(() => {
      for (const item of checkedItems) {
        locallyRemovedIdsRef.current.delete(item.id);
      }
    }, 3000);

    setItems((prev) => prev.filter((item) => item.checked_at === null));

    void (async () => {
      const { error } = await supabase
        .from("items")
        .delete()
        .eq("list_id", listId)
        .not("checked_at", "is", null);

      if (error) {
        setItems((prev) => [...prev, ...checkedItems]);
        toast.error(t("clearCheckedError"), {
          action: { label: tCommon("retry"), onClick: () => handleClearCheckedRef.current() },
        });
        return;
      }

      toast.success(t("clearedChecked", { count: checkedItems.length }));
    })();
  }, [items, listId, supabase, t, tCommon]);

  useEffect(() => {
    handleRichAddRef.current = handleRichAdd;
    handleToggleCheckedRef.current = handleToggleChecked;
    handleRemoveRef.current = handleRemove;
    handleUndoRemoveRef.current = handleUndoRemove;
    handleClearCheckedRef.current = handleClearChecked;
    handleEditRef.current = handleEdit;
  });

  const refetchAll = useCallback(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("list_id", listId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setItems(data as Item[]);
        await refetchImages((data as Item[]).map((row) => row.id));
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
    onOtherUserCheck: (row, checked) => {
      const checkerName = nameFor(row.checked_by);
      if (!checkerName) return;
      toast(
        checked
          ? t("checkedByOther", { name: row.name, user: checkerName })
          : t("uncheckedByOther", { name: row.name, user: checkerName }),
      );
    },
    onOtherUserRemove: (row) => {
      if (locallyRemovedIdsRef.current.has(row.id)) return;
      if (!row.name?.trim()) return;
      toast(t("removedByOther", { name: row.name }));
    },
    onRefetch: refetchAll,
  });

  const currentItemNames = useMemo(() => items.map((item) => item.name), [items]);
  const detailImages = detailItem ? imagesByItemId.get(detailItem.id) ?? [] : [];

  return (
    <div className="flex flex-1 flex-col gap-3 pb-sticky-add-bar md:pb-0">
      <PartnerPresence
        listId={listId}
        currentUserId={currentUserId}
        displayName={myDisplayName}
        memberIds={memberIds}
      />

      <ListActivityStrip items={items} nameFor={nameFor} />

      <ListAddSection
        listId={listId}
        listType={listType}
        pending={adding}
        currentItemNames={currentItemNames}
        onRichAdd={handleRichAdd}
        onQuickAdd={handleQuickAdd}
        onBulkAdd={handleBulkAdd}
        onSmartAddBulk={handleSmartAddBulk}
        bulkOpen={bulkOpen}
        onBulkOpenChange={setBulkOpen}
      />

      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {t("itemCount", { count: sortedItems.length })}
        </span>
        {hasChecked && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearChecked}
            className="text-muted-foreground hover:text-destructive"
          >
            {t("clearChecked")}
          </Button>
        )}
      </div>

      {sortedItems.length === 0 ? (
        <EmptyState
          icon="🛒"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          actionLabel={t("emptyAction")}
          onAction={() => setBulkOpen(true)}
        />
      ) : (
        <>
          {allChecked && (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-duo-gold-tint px-3 py-2.5 text-sm text-foreground">
              <span>{t("allDone")}</span>
              <Button variant="secondary" size="sm" onClick={handleClearChecked}>
                {t("clearCheckedPrompt")}
              </Button>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {uncheckedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                adderColor={colorMap.get(item.created_by) ?? UNKNOWN_MEMBER_COLOR}
                checkerColor={
                  item.checked_by ? colorMap.get(item.checked_by) ?? UNKNOWN_MEMBER_COLOR : null
                }
                imageUrl={primaryImageUrl(item.id)}
                hasImages={(imagesByItemId.get(item.id)?.length ?? 0) > 0}
                onToggle={handleToggleChecked}
                onOpenDetail={setDetailItem}
                onRemove={handleRemove}
              />
            ))}
          </ul>
          <CheckedItemsSection
            items={checkedItemsList}
            colorMap={colorMap}
            unknownColor={UNKNOWN_MEMBER_COLOR}
            primaryImageUrl={primaryImageUrl}
            imagesByItemId={imagesByItemId}
            onToggle={handleToggleChecked}
            onOpenDetail={setDetailItem}
            onRemove={handleRemove}
          />
        </>
      )}

      <AllDoneCelebration active={celebrate} />

      <ItemDetailDialog
        item={detailItem}
        open={detailItem !== null}
        onOpenChange={(open) => !open && setDetailItem(null)}
        listId={listId}
        listType={listType}
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
        onToggle={handleToggleChecked}
        onRemove={handleRemove}
        onSave={handleEdit}
        onPhotosAdded={() => void refetchImages(items.map((i) => i.id))}
        onImageRemoved={() => void refetchImages(items.map((i) => i.id))}
      />
    </div>
  );
}
