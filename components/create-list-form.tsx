"use client";

import { useTranslations } from "next-intl";

import { LIST_TYPE_KEYS, getListTypeIcon, type ListTypeKey } from "@/lib/list-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CreateListFormProps = {
  name: string;
  onNameChange: (name: string) => void;
  type: ListTypeKey;
  onTypeChange: (type: ListTypeKey) => void;
  nameInputId?: string;
  autoFocus?: boolean;
};

export function CreateListForm({
  name,
  onNameChange,
  type,
  onTypeChange,
  nameInputId = "list-name",
  autoFocus = false,
}: CreateListFormProps) {
  const t = useTranslations("createList");
  const tListTypes = useTranslations("listTypes");
  const tCommon = useTranslations("common");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameInputId}>{tCommon("name")}</Label>
        <Input
          id={nameInputId}
          className="h-11 rounded-xl"
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          autoFocus={autoFocus}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("typeLabel")}</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LIST_TYPE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onTypeChange(key)}
              aria-pressed={type === key}
              className={cn(
                "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2.5 text-xs font-medium transition-colors",
                type === key
                  ? "border-primary bg-duo-coral-tint text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="text-xl leading-none">{getListTypeIcon(key)}</span>
              {tListTypes(key)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
