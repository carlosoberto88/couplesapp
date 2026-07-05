"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type QuickAddBarProps = {
  listType: string;
  onAdd: (name: string) => void;
  pending?: boolean;
  className?: string;
  autoFocus?: boolean;
};

export function QuickAddBar({
  listType,
  onAdd,
  pending = false,
  className,
  autoFocus = false,
}: QuickAddBarProps) {
  const tItems = useTranslations("items");
  const tWishlist = useTranslations("wishlist");
  const wishlist = listType === "wishlist";
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || pending) return;
    onAdd(trimmed);
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <form
      className={cn("flex items-center gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        ref={inputRef}
        className="h-11 flex-1 rounded-xl"
        placeholder={wishlist ? tWishlist("namePlaceholder") : tItems("addPlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        autoFocus={autoFocus}
        aria-label={tItems("addAriaLabel")}
      />
      <Button
        type="submit"
        size="icon-lg"
        className="size-11 shrink-0 rounded-xl bg-duo-teal text-white hover:bg-duo-teal/90"
        disabled={pending || !value.trim()}
        aria-label={tItems("addSubmit")}
      >
        <Plus />
      </Button>
    </form>
  );
}
