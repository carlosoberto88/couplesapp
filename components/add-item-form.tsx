"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";

type AddItemFormProps = {
  onAdd: (name: string) => void;
};

export function AddItemForm({ onAdd }: AddItemFormProps) {
  const t = useTranslations("items");
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    onAdd(trimmed);
    setName("");
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("addPlaceholder")}
        autoFocus
        aria-label={t("addAriaLabel")}
        className="h-11 rounded-full border-border bg-card px-4 text-sm focus-visible:border-primary focus-visible:ring-primary/30"
      />
    </form>
  );
}
