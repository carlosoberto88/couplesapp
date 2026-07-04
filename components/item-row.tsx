"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";

import type { Item } from "@/lib/types";
import type { MemberColor } from "@/lib/member-colors";
import { UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ItemRowProps = {
  item: Item;
  adderColor: MemberColor;
  checkerColor: MemberColor | null;
  onToggle: (item: Item) => void;
  onRemove: (item: Item) => void;
  onUpdateNote: (item: Item, note: string | null) => void;
};

export function ItemRow({
  item,
  adderColor,
  checkerColor,
  onToggle,
  onRemove,
  onUpdateNote,
}: ItemRowProps) {
  const t = useTranslations("items");
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(item.note ?? "");
  const checked = item.checked_at !== null;
  const checkColor = checkerColor ?? UNKNOWN_MEMBER_COLOR;

  function commitNote() {
    setEditingNote(false);
    const trimmed = noteValue.trim();
    onUpdateNote(item, trimmed.length > 0 ? trimmed : null);
  }

  return (
    <li
      className={cn(
        "animate-item-in flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 transition-opacity",
        checked && "opacity-60",
      )}
      onClick={() => onToggle(item)}
    >
      <span
        aria-hidden
        title={t("addedBy")}
        className="mt-1.5 size-2 shrink-0 rounded-full"
        style={{ backgroundColor: adderColor.color }}
      />

      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          checked ? "border-transparent text-primary-foreground animate-check-pop" : "border-input",
        )}
        style={checked ? { backgroundColor: checkColor.color } : undefined}
      >
        {checked && <Check className="size-3" />}
      </span>

      <div className="flex flex-1 flex-col gap-0.5">
        <span className={cn("text-sm text-foreground", checked && "text-muted-foreground line-through")}>
          {item.name}
        </span>

        {editingNote ? (
          <input
            autoFocus
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={commitNote}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitNote();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder={t("addNotePlaceholder")}
            className="border-b border-input bg-transparent text-xs text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setNoteValue(item.note ?? "");
              setEditingNote(true);
            }}
            className={cn(
              "w-fit text-left text-xs text-muted-foreground",
              !item.note && "text-muted-foreground/50",
            )}
          >
            {item.note ?? t("addNote")}
          </button>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item);
        }}
        aria-label={t("removeItem", { name: item.name })}
      >
        <X />
      </Button>
    </li>
  );
}
