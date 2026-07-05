"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Item, ListMember, Profile } from "@/lib/types";
import { buildMemberColorMap, UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { Button } from "@/components/ui/button";
import { AddItemForm } from "@/components/add-item-form";
import { SmartAdd } from "@/components/smart-add";
import { UsualItems } from "@/components/usual-items";
import { useRealtimeItems } from "@/lib/use-realtime-items";
import { ItemRow } from "@/components/item-row";
import { sortItems, upsertRow, removeRow } from "@/lib/item-list-utils";

const UNDO_GRACE_MS = 5000;

type MemberWithProfile = ListMember & {
  profiles: Pick<Profile, "id" | "email" | "display_name"> | null;
};

type ShoppingItemListProps = {
  listId: string;
  currentUserId: string;
  initialItems: Item[];
  members: MemberWithProfile[];
};

function emptyItemFields() {
  return {
    url: null,
    reserved_by: null,
    reserved_at: null,
    price: null,
    currency: null,
    priority: null,
  } as const;
}

export function ShoppingItemList({
  listId,
  currentUserId,
  initialItems,
  members,
}: ShoppingItemListProps) {
  const supabase = useSupabaseClient();
  const t = useTranslations("items");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<Item[]>(initialItems);

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

  const sortedItems = useMemo(() => sortItems(items), [items]);
  const hasChecked = sortedItems.some((item) => item.checked_at !== null);
  const allChecked = sortedItems.length > 0 && hasChecked && sortedItems.every((item) => item.checked_at !== null);

  const handleAddRef = useRef<(name: string, note?: string | null) => void>(() => {});
  const handleToggleCheckedRef = useRef<(item: Item) => void>(() => {});
  const handleUpdateNoteRef = useRef<(item: Item, note: string | null) => void>(() => {});
  const handleRemoveRef = useRef<(item: Item) => void>(() => {});
  const handleUndoRemoveRef = useRef<(item: Item, toastId: string | number) => void>(() => {});
  const handleClearCheckedRef = useRef<() => void>(() => {});
  const locallyRemovedIdsRef = useRef<Set<string>>(new Set());

  const handleAdd = useCallback(
    (name: string, note: string | null = null) => {
      const newItem: Item = {
        id: crypto.randomUUID(),
        list_id: listId,
        name,
        note,
        position: 0,
        created_by: currentUserId,
        created_at: new Date().toISOString(),
        checked_at: null,
        checked_by: null,
        ...emptyItemFields(),
      };

      setItems((prev) => upsertRow(prev, newItem));

      void (async () => {
        const { error } = await supabase.from("items").insert({
          id: newItem.id,
          list_id: newItem.list_id,
          name: newItem.name,
          note: newItem.note,
          position: newItem.position,
          created_by: newItem.created_by,
        });

        if (error) {
          setItems((prev) => removeRow(prev, newItem.id));
          toast.error(t("saveError"), {
            action: { label: tCommon("retry"), onClick: () => handleAddRef.current(name, note) },
          });
        }
      })();
    },
    [listId, currentUserId, supabase, t, tCommon],
  );

  const handleToggleChecked = useCallback(
    (item: Item) => {
      const wasChecked = item.checked_at !== null;
      const nextItem: Item = wasChecked
        ? { ...item, checked_at: null, checked_by: null }
        : { ...item, checked_at: new Date().toISOString(), checked_by: currentUserId };

      setItems((prev) => upsertRow(prev, nextItem));

      void (async () => {
        const { error } = await supabase
          .from("items")
          .update({ checked_at: nextItem.checked_at, checked_by: nextItem.checked_by })
          .eq("id", item.id);

        if (error) {
          setItems((prev) => upsertRow(prev, item));
          toast.error(t("saveError"), {
            action: { label: tCommon("retry"), onClick: () => handleToggleCheckedRef.current(item) },
          });
        }
      })();
    },
    [currentUserId, supabase, t, tCommon],
  );

  const handleUpdateNote = useCallback((item: Item, note: string | null) => {
    if (note === item.note) return;
    setItems((prev) => upsertRow(prev, { ...item, note }));

    void (async () => {
      const { error } = await supabase.from("items").update({ note }).eq("id", item.id);

      if (error) {
        setItems((prev) => upsertRow(prev, item));
        toast.error(t("saveNoteError"), {
          action: { label: tCommon("retry"), onClick: () => handleUpdateNoteRef.current(item, note) },
        });
      }
    })();
  }, [supabase, t, tCommon]);

  const handleUndoRemove = useCallback((item: Item, toastId: string | number) => {
    setItems((prev) => upsertRow(prev, item));

    void (async () => {
      const { error } = await supabase.from("items").insert({
        id: item.id,
        list_id: item.list_id,
        name: item.name,
        note: item.note,
        position: item.position,
        created_by: item.created_by,
        checked_at: item.checked_at,
        checked_by: item.checked_by,
        url: item.url,
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
    locallyRemovedIdsRef.current.add(item.id);
    setTimeout(() => {
      locallyRemovedIdsRef.current.delete(item.id);
    }, 3000);

    setItems((prev) => removeRow(prev, item.id));

    void (async () => {
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
  }, [supabase, t, tCommon]);

  const handleClearChecked = useCallback(() => {
    const checkedItems = items.filter((item) => item.checked_at !== null);
    if (checkedItems.length === 0) return;

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
      }
    })();
  }, [items, listId, supabase, t, tCommon]);

  useEffect(() => {
    handleAddRef.current = handleAdd;
    handleToggleCheckedRef.current = handleToggleChecked;
    handleUpdateNoteRef.current = handleUpdateNote;
    handleRemoveRef.current = handleRemove;
    handleUndoRemoveRef.current = handleUndoRemove;
    handleClearCheckedRef.current = handleClearChecked;
  });

  const handleRealtimeUpsert = useCallback((row: Item) => {
    setItems((prev) => upsertRow(prev, row));
  }, []);

  const handleRealtimeRemove = useCallback((id: string) => {
    setItems((prev) => removeRow(prev, id));
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

  const handleOtherUserCheck = useCallback(
    (row: Item, checked: boolean) => {
      const checkerName = nameFor(row.checked_by);
      if (!checkerName) return;
      toast(
        checked
          ? t("checkedByOther", { name: row.name, user: checkerName })
          : t("uncheckedByOther", { name: row.name, user: checkerName }),
      );
    },
    [nameFor, t],
  );

  const handleOtherUserRemove = useCallback(
    (row: Item) => {
      if (locallyRemovedIdsRef.current.has(row.id)) return;
      toast(t("removedByOther", { name: row.name }));
    },
    [t],
  );

  const refetchItems = useCallback(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("list_id", listId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setItems(data as Item[]);
      }
    })();
  }, [listId, supabase]);

  useRealtimeItems(listId, currentUserId, {
    onUpsert: handleRealtimeUpsert,
    onRemove: handleRealtimeRemove,
    onOtherUserAdd: handleOtherUserAdd,
    onOtherUserCheck: handleOtherUserCheck,
    onOtherUserRemove: handleOtherUserRemove,
    onRefetch: refetchItems,
  });

  const currentItemNames = useMemo(() => items.map((item) => item.name), [items]);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <UsualItems listId={listId} currentItemNames={currentItemNames} onAdd={handleAdd} />
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <AddItemForm onAdd={handleAdd} />
        </div>
        <SmartAdd listId={listId} onAdd={handleAdd} />
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {t("itemCount", { count: sortedItems.length })}
        </span>
        {hasChecked && (
          <Button variant="ghost" size="sm" onClick={handleClearChecked} className="text-muted-foreground hover:text-destructive">
            {t("clearChecked")}
          </Button>
        )}
      </div>

      {sortedItems.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
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
            {sortedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                adderColor={colorMap.get(item.created_by) ?? UNKNOWN_MEMBER_COLOR}
                checkerColor={item.checked_by ? colorMap.get(item.checked_by) ?? UNKNOWN_MEMBER_COLOR : null}
                onToggle={handleToggleChecked}
                onRemove={handleRemove}
                onUpdateNote={handleUpdateNote}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
