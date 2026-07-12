"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Item, ItemImage, ListMember, Profile } from "@/lib/types";
import { buildMemberColorMap, UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { buildAssignPatch, type ItemUpdatePatch } from "@/lib/item-mutations";
import { buildNewItem, insertItemWithImages, insertItemsBulk } from "@/lib/persist-item";
import { useItemImages } from "@/lib/use-item-images";
import { Button } from "@/components/ui/button";
import { initialsFor } from "@/components/member-avatar";
import type { RichAddInput } from "@/components/rich-add-item-form";
import { ListAddSection } from "@/components/list-add-section";
import { EmptyState } from "@/components/empty-state";
import { AllDoneCelebration } from "@/components/all-done-celebration";
import { ListActivityStrip } from "@/components/list-activity-strip";
import { PartnerPresence } from "@/components/partner-presence";
import { ShoppingPresence } from "@/components/shopping-presence";
import { CheckedItemsSection } from "@/components/checked-items-section";
import { useRealtimeItems } from "@/lib/use-realtime-items";
import { ItemRow } from "@/components/item-row";
import type { ItemRowDragHandleProps } from "@/components/item-row";
import { ItemDetailDialog } from "@/components/item-detail-dialog";
import { aisleGroupKey, sortItems, upsertRow, removeRow } from "@/lib/item-list-utils";
import { createOtherUserAddToastDebouncer } from "@/lib/debounce-toasts";
import { getListTypeConfig } from "@/lib/list-types";

const REORDER_GAP_EPSILON = 1e-6;
const REORDER_SPACING = 1024;

type SortableItemRowProps = {
  item: Item;
  children: (
    dragHandleProps: ItemRowDragHandleProps,
    dragActivatorRef: (node: HTMLElement | null) => void,
    dragRef: (node: HTMLLIElement | null) => void,
    dragStyle: CSSProperties,
  ) => ReactNode;
};

function SortableItemRow({ item, children }: SortableItemRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  return (
    <>{children({ attributes, listeners }, setActivatorNodeRef, setNodeRef, style)}</>
  );
}

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
  listRecurring: boolean;
};

export function ShoppingItemList({
  listId,
  listType,
  listOwnerId,
  currentUserId,
  initialItems,
  initialImages,
  members,
  listRecurring,
}: ShoppingItemListProps) {
  const supabase = useSupabaseClient();
  const t = useTranslations("items");
  const tBulk = useTranslations("bulkAdd");
  const tCommon = useTranslations("common");
  const tShoppingNow = useTranslations("shoppingNow");
  const [items, setItems] = useState<Item[]>(initialItems);
  const [adding, setAdding] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [shoppingNow, setShoppingNow] = useState(false);
  const prevAllCheckedRef = useRef(false);
  const shoppingNowPostInFlightRef = useRef(false);

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

  const assignMembers = useMemo(
    () =>
      members.map((m) => ({
        id: m.user_id,
        name: nameFor(m.user_id) ?? m.user_id,
        initials: initialsFor(m.profiles),
        color: colorMap.get(m.user_id) ?? UNKNOWN_MEMBER_COLOR,
      })),
    [members, nameFor, colorMap],
  );

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
  const showAisle =
    getListTypeConfig(listType).supportsAisles &&
    uncheckedItems.some((item) => item.aisle !== null);
  const supportsReorder = getListTypeConfig(listType).supportsReorder;
  const canShoppingNow =
    listType === "shopping" &&
    members.some((member) => member.user_id !== currentUserId);
  const allChecked =
    sortedItems.length > 0 && hasChecked && uncheckedItems.length === 0;

  // Unchecked items grouped by aisle, in display order — each group becomes
  // its own `SortableContext` so drag can only reorder within a group
  // (cross-aisle drag is structurally out of scope; see spec). Lists with
  // no aisle tags collapse to a single group, giving plain reorder.
  const uncheckedGroups = useMemo(() => {
    const groups: { key: string | null; items: Item[] }[] = [];
    for (const item of uncheckedItems) {
      const key = aisleGroupKey(item.aisle);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(item);
      } else {
        groups.push({ key, items: [item] });
      }
    }
    return groups;
  }, [uncheckedItems]);

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
  const handleFinishRef = useRef<() => void>(() => {});
  const handleUndoFinishRef = useRef<(snapshot: Item[], toastId: string | number) => void>(() => {});
  const handleEditRef = useRef<(item: Item, patch: ItemUpdatePatch) => void>(() => {});
  const handleAssignRef = useRef<(item: Item, userId: string | null) => void>(() => {});
  const handleReorderRef = useRef<(groupItems: Item[], activeId: string, overId: string) => void>(
    () => {},
  );
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

  const handleAssign = useCallback(
    (item: Item, userId: string | null) => {
      updateItem(item, buildAssignPatch(userId), () => handleAssignRef.current(item, userId));
    },
    [updateItem],
  );

  // Reorders `groupItems` (one aisle group's unchecked items, already in
  // display order) by moving `activeId` to where `overId` sits, then
  // persists the moved item's new `position` — a midpoint of its new
  // neighbors, or a full-group renumber when the gap is exhausted (see
  // "Drag UX + position assignment" in the shopping-efficiency spec).
  const handleReorder = useCallback(
    (groupItems: Item[], activeId: string, overId: string) => {
      const oldIndex = groupItems.findIndex((i) => i.id === activeId);
      const newIndex = groupItems.findIndex((i) => i.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(groupItems, oldIndex, newIndex);
      const movedIndex = reordered.findIndex((i) => i.id === activeId);
      const prevNeighbor = reordered[movedIndex - 1] ?? null;
      const nextNeighbor = reordered[movedIndex + 1] ?? null;
      const prevPos = prevNeighbor?.position ?? null;
      const nextPos = nextNeighbor?.position ?? null;

      const gapExhausted =
        prevPos !== null && nextPos !== null && nextPos - prevPos < REORDER_GAP_EPSILON;

      if (gapExhausted) {
        const renumbered = reordered.map((item, idx) => ({
          ...item,
          position: (idx + 1) * REORDER_SPACING,
        }));

        setItems((prev) => {
          let next = prev;
          for (const item of renumbered) next = upsertRow(next, item);
          return next;
        });

        void (async () => {
          const results = await Promise.all(
            renumbered.map((item) =>
              supabase.from("items").update({ position: item.position }).eq("id", item.id),
            ),
          );
          if (results.some((result) => result.error)) {
            setItems((prev) => {
              let next = prev;
              for (const item of groupItems) next = upsertRow(next, item);
              return next;
            });
            toast.error(t("saveError"), {
              action: {
                label: tCommon("retry"),
                onClick: () => handleReorderRef.current(groupItems, activeId, overId),
              },
            });
          }
        })();
        return;
      }

      const newPosition =
        prevPos === null && nextPos === null
          ? REORDER_SPACING
          : prevPos === null
            ? (nextPos as number) - 1
            : nextPos === null
              ? prevPos + 1
              : (prevPos + nextPos) / 2;

      const movedItem = groupItems[oldIndex];
      updateItem(movedItem, { position: newPosition }, () =>
        handleReorderRef.current(groupItems, activeId, overId),
      );
    },
    [supabase, t, tCommon, updateItem],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const group = uncheckedGroups.find((g) => g.items.some((i) => i.id === active.id));
      if (!group) return;
      const overInGroup = group.items.some((i) => i.id === over.id);
      if (!overInGroup) return;
      handleReorder(group.items, String(active.id), String(over.id));
    },
    [uncheckedGroups, handleReorder],
  );

  const handleUndoRemove = useCallback((item: Item, toastId: string | number) => {
    setItems((prev) => upsertRow(prev, item));

    void (async () => {
      const { error } = await supabase.from("items").update({ removed_at: null }).eq("id", item.id);

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
    locallyRemovedIdsRef.current.add(item.id);
    setTimeout(() => locallyRemovedIdsRef.current.delete(item.id), 3000);

    setItems((prev) => removeRow(prev, item.id));
    if (detailItem?.id === item.id) setDetailItem(null);

    void (async () => {
      const { error } = await supabase
        .from("items")
        .update({ removed_at: new Date().toISOString() })
        .eq("id", item.id)
        .is("removed_at", null);

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
  }, [supabase, t, tCommon, detailItem?.id]);

  // Optimistic local mirror of the server-side finish/checkout branch — shared
  // by handleFinish (initial apply) and handleUndoFinish (rollback on error).
  const applyOptimisticFinish = useCallback(
    (checkedItems: Item[]) => {
      setItems((prev) => {
        let next = prev;
        for (const item of checkedItems) {
          if (listRecurring && !item.is_extra) {
            next = upsertRow(next, { ...item, checked_at: null, checked_by: null });
          } else {
            next = removeRow(next, item.id);
          }
        }
        return next;
      });
    },
    [listRecurring],
  );

  const handleUndoFinish = useCallback(
    (snapshot: Item[], toastId: string | number) => {
      setItems((prev) => {
        let next = prev;
        for (const item of snapshot) next = upsertRow(next, item);
        return next;
      });

      void (async () => {
        let hasError = false;

        if (listRecurring) {
          const extraIds = snapshot.filter((item) => item.is_extra).map((item) => item.id);
          const staples = snapshot.filter((item) => !item.is_extra);

          const results = await Promise.all([
            extraIds.length > 0
              ? supabase.from("items").update({ removed_at: null }).in("id", extraIds)
              : Promise.resolve({ error: null }),
            ...staples.map((item) =>
              supabase
                .from("items")
                .update({ checked_at: item.checked_at, checked_by: item.checked_by })
                .eq("id", item.id),
            ),
          ]);
          hasError = results.some((result) => result.error);
        } else {
          const { error } = await supabase
            .from("items")
            .update({ removed_at: null })
            .in("id", snapshot.map((item) => item.id));
          hasError = !!error;
        }

        if (hasError) {
          applyOptimisticFinish(snapshot);
          toast.error(t("undoError"), {
            action: {
              label: tCommon("retry"),
              onClick: () => handleUndoFinishRef.current(snapshot, toastId),
            },
          });
          return;
        }

        toast.dismiss(toastId);
      })();
    },
    [applyOptimisticFinish, listRecurring, supabase, t, tCommon],
  );

  const handleFinish = useCallback(() => {
    const checkedItems = items.filter((item) => item.checked_at !== null);
    if (checkedItems.length === 0) return;

    for (const item of checkedItems) {
      if (!listRecurring || item.is_extra) {
        locallyRemovedIdsRef.current.add(item.id);
      }
    }
    setTimeout(() => {
      for (const item of checkedItems) {
        locallyRemovedIdsRef.current.delete(item.id);
      }
    }, 3000);

    applyOptimisticFinish(checkedItems);

    void (async () => {
      let hasError = false;
      const now = new Date().toISOString();

      if (listRecurring) {
        const results = await Promise.all([
          supabase
            .from("items")
            .update({ removed_at: now })
            .eq("list_id", listId)
            .eq("is_extra", true)
            .not("checked_at", "is", null)
            .is("removed_at", null),
          supabase
            .from("items")
            .update({ checked_at: null, checked_by: null })
            .eq("list_id", listId)
            .eq("is_extra", false)
            .not("checked_at", "is", null)
            .is("removed_at", null),
        ]);
        hasError = results.some((result) => result.error);
      } else {
        const { error } = await supabase
          .from("items")
          .update({ removed_at: now })
          .eq("list_id", listId)
          .not("checked_at", "is", null)
          .is("removed_at", null);
        hasError = !!error;
      }

      if (hasError) {
        setItems((prev) => {
          let next = prev;
          for (const item of checkedItems) next = upsertRow(next, item);
          return next;
        });
        toast.error(t("clearCheckedError"), {
          action: { label: tCommon("retry"), onClick: () => handleFinishRef.current() },
        });
        return;
      }

      const removedExtrasCount = listRecurring
        ? checkedItems.filter((item) => item.is_extra).length
        : checkedItems.length;

      const message = listRecurring
        ? removedExtrasCount > 0
          ? t("finishedToast", { count: removedExtrasCount })
          : t("resetToast")
        : t("clearedChecked", { count: checkedItems.length });

      const toastId = toast(message, {
        duration: UNDO_GRACE_MS,
        action: {
          label: tCommon("undo"),
          onClick: () => handleUndoFinishRef.current(checkedItems, toastId),
        },
      });
    })();
  }, [applyOptimisticFinish, items, listId, listRecurring, supabase, t, tCommon]);

  useEffect(() => {
    handleRichAddRef.current = handleRichAdd;
    handleToggleCheckedRef.current = handleToggleChecked;
    handleRemoveRef.current = handleRemove;
    handleUndoRemoveRef.current = handleUndoRemove;
    handleFinishRef.current = handleFinish;
    handleUndoFinishRef.current = handleUndoFinish;
    handleEditRef.current = handleEdit;
    handleAssignRef.current = handleAssign;
    handleReorderRef.current = handleReorder;
  });

  const refetchAll = useCallback(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("list_id", listId)
        .is("removed_at", null)
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
  const finishLabel = listRecurring ? t("finishShopping") : t("clearChecked");

  // Fires the one-shot "at the store" push only on turn-ON, from this click
  // handler — never from an effect, so it never re-fires on re-render.
  const handleToggleShoppingNow = useCallback(() => {
    if (shoppingNow) {
      setShoppingNow(false);
      return;
    }

    if (shoppingNowPostInFlightRef.current) return;
    shoppingNowPostInFlightRef.current = true;

    setShoppingNow(true);
    fetch("/api/shopping-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listId }),
    })
      .then((res) => {
        if (!res.ok) toast.error(t("saveError"));
      })
      .catch(() => toast.error(t("saveError")))
      .finally(() => {
        shoppingNowPostInFlightRef.current = false;
      });
  }, [shoppingNow, listId, t]);

  return (
    <div className="flex flex-1 flex-col gap-3 pb-sticky-add-bar md:pb-0">
      <PartnerPresence
        listId={listId}
        currentUserId={currentUserId}
        displayName={myDisplayName}
        memberIds={memberIds}
        colorMap={colorMap}
      />

      <ShoppingPresence
        listId={listId}
        currentUserId={currentUserId}
        displayName={myDisplayName}
        memberIds={memberIds}
        active={shoppingNow}
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
        addOpen={addOpen}
        onAddOpenChange={setAddOpen}
      />

      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {t("itemCount", { count: sortedItems.length })}
        </span>
        <div className="flex items-center gap-2">
          {canShoppingNow && (
            <Button
              variant={shoppingNow ? "secondary" : "outline"}
              size="sm"
              onClick={handleToggleShoppingNow}
            >
              {shoppingNow ? tShoppingNow("exit") : tShoppingNow("start")}
            </Button>
          )}
          {hasChecked && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFinish}
              className="text-muted-foreground hover:text-destructive"
            >
              {finishLabel}
            </Button>
          )}
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <EmptyState
          icon="🛒"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          actionLabel={t("emptyAction")}
          onAction={() => setAddOpen(true)}
        />
      ) : (
        <>
          {allChecked && (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-duo-teal-tint px-3 py-2.5 text-sm text-foreground">
              <span className="font-medium text-duo-teal">{t("allDone")}</span>
              <Button variant="secondary" size="sm" onClick={handleFinish}>
                {finishLabel}
              </Button>
            </div>
          )}
          {shoppingNow && (
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-duo-teal">
              {tShoppingNow("focusLabel")}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {supportsReorder && !shoppingNow ? (
              <DndContext
                sensors={dragSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                {uncheckedGroups.map((group) => (
                  <Fragment key={group.key ?? "__no_aisle__"}>
                    {showAisle && (
                      <li className="flex items-center gap-2 px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-duo-teal first:pt-0">
                        <span>{group.key === null ? t("noAisle") : group.items[0].aisle?.trim()}</span>
                        <span className="h-px flex-1 bg-duo-teal/15" aria-hidden />
                      </li>
                    )}
                    <SortableContext
                      items={group.items.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {group.items.map((item) => (
                        <SortableItemRow key={item.id} item={item}>
                          {(dragHandleProps, dragActivatorRef, dragRef, dragStyle) => (
                            <ItemRow
                              item={item}
                              adderColor={colorMap.get(item.created_by) ?? UNKNOWN_MEMBER_COLOR}
                              checkerColor={
                                item.checked_by
                                  ? colorMap.get(item.checked_by) ?? UNKNOWN_MEMBER_COLOR
                                  : null
                              }
                              imageUrl={primaryImageUrl(item.id)}
                              hasImages={(imagesByItemId.get(item.id)?.length ?? 0) > 0}
                              listRecurring={listRecurring}
                              showAisle={showAisle}
                              dragHandleProps={dragHandleProps}
                              dragActivatorRef={dragActivatorRef}
                              dragRef={dragRef}
                              dragStyle={dragStyle}
                              onToggle={handleToggleChecked}
                              onOpenDetail={setDetailItem}
                              onRemove={handleRemove}
                              onEdit={handleEdit}
                              assignMembers={assignMembers.length >= 2 ? assignMembers : undefined}
                              currentUserId={currentUserId}
                              onAssign={handleAssign}
                            />
                          )}
                        </SortableItemRow>
                      ))}
                    </SortableContext>
                  </Fragment>
                ))}
              </DndContext>
            ) : (
              (() => {
                let lastAisleGroup: string | null | undefined;
                return uncheckedItems.map((item) => {
                  const aisleGroup = aisleGroupKey(item.aisle);
                  const showHeader = showAisle && aisleGroup !== lastAisleGroup;
                  lastAisleGroup = aisleGroup;

                  return (
                    <Fragment key={item.id}>
                      {showHeader && (
                        <li className="flex items-center gap-2 px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-duo-teal first:pt-0">
                          <span>{aisleGroup === null ? t("noAisle") : item.aisle?.trim()}</span>
                          <span className="h-px flex-1 bg-duo-teal/15" aria-hidden />
                        </li>
                      )}
                      <ItemRow
                        item={item}
                        adderColor={colorMap.get(item.created_by) ?? UNKNOWN_MEMBER_COLOR}
                        checkerColor={
                          item.checked_by ? colorMap.get(item.checked_by) ?? UNKNOWN_MEMBER_COLOR : null
                        }
                        imageUrl={primaryImageUrl(item.id)}
                        hasImages={(imagesByItemId.get(item.id)?.length ?? 0) > 0}
                        listRecurring={listRecurring}
                        showAisle={showAisle}
                        focusMode={shoppingNow}
                        onToggle={handleToggleChecked}
                        onOpenDetail={setDetailItem}
                        onRemove={handleRemove}
                        onEdit={handleEdit}
                        assignMembers={assignMembers.length >= 2 ? assignMembers : undefined}
                        currentUserId={currentUserId}
                        onAssign={handleAssign}
                      />
                    </Fragment>
                  );
                });
              })()
            )}
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
        listRecurring={listRecurring}
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
