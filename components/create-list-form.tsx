"use client";

import { useTranslations } from "next-intl";

import {
  LIST_TYPE_KEYS,
  getListTypeConfig,
  getListTypeIcon,
  type ListTypeKey,
} from "@/lib/list-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CreateListFormProps = {
  name: string;
  onNameChange: (name: string) => void;
  type: ListTypeKey;
  onTypeChange: (type: ListTypeKey) => void;
  recurring?: boolean;
  onRecurringChange?: (recurring: boolean) => void;
  nameInputId?: string;
  autoFocus?: boolean;
};

export function CreateListForm({
  name,
  onNameChange,
  type,
  onTypeChange,
  recurring = false,
  onRecurringChange,
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
      {getListTypeConfig(type).supportsRecurring ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="create-list-recurring">{t("recurringLabel")}</Label>
            <p className="text-xs text-muted-foreground">{t("recurringHint")}</p>
          </div>
          <button
            id="create-list-recurring"
            type="button"
            role="switch"
            aria-checked={recurring}
            onClick={() => onRecurringChange?.(!recurring)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              recurring ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform",
                recurring && "translate-x-5",
              )}
            />
          </button>
        </div>
      ) : null}
    </div>
  );
}
