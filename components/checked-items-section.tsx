"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import type { Item } from "@/lib/types";
import type { MemberColor } from "@/lib/member-colors";
import { ItemRow } from "@/components/item-row";
import { cn } from "@/lib/utils";

type CheckedItemsSectionProps = {
  items: Item[];
  colorMap: Map<string, MemberColor>;
  unknownColor: MemberColor;
  primaryImageUrl: (id: string) => string | null;
  imagesByItemId: Map<string, unknown[]>;
  onToggle: (item: Item) => void;
  onOpenDetail: (item: Item) => void;
  onRemove: (item: Item) => void;
};

export function CheckedItemsSection({
  items,
  colorMap,
  unknownColor,
  primaryImageUrl,
  imagesByItemId,
  onToggle,
  onOpenDetail,
  onRemove,
}: CheckedItemsSectionProps) {
  const t = useTranslations("items");
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn("size-4 transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
        {t("checkedCount", { count: items.length })}
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-2 opacity-80">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              adderColor={colorMap.get(item.created_by) ?? unknownColor}
              checkerColor={
                item.checked_by ? colorMap.get(item.checked_by) ?? unknownColor : null
              }
              imageUrl={primaryImageUrl(item.id)}
              hasImages={(imagesByItemId.get(item.id)?.length ?? 0) > 0}
              onToggle={onToggle}
              onOpenDetail={onOpenDetail}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
