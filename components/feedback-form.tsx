"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FeedbackType = "suggestion" | "bug";

const MIN_LENGTH = 10;
const MAX_LENGTH = 4000;

export function FeedbackForm() {
  const t = useTranslations("settings.feedback");
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const trimmedLength = message.trim().length;
  const canSubmit = trimmedLength >= MIN_LENGTH && trimmedLength <= MAX_LENGTH && !pending;

  async function handleSubmit() {
    if (!canSubmit) return;

    setPending(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: message.trim(),
          pageUrl: window.location.pathname,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        toast.error(data?.error ?? t("submitError"));
        return;
      }

      toast.success(t("submitSuccess"));
      setMessage("");
      setType("suggestion");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex w-fit gap-1 rounded-full bg-muted p-1">
        {(["suggestion", "bug"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            aria-pressed={type === value}
            onClick={() => setType(value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              type === value
                ? "bg-duo-coral-tint text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "suggestion" ? t("typeSuggestion") : t("typeBug")}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={t("placeholder")}
        rows={4}
        maxLength={MAX_LENGTH}
        disabled={pending}
        className="w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      />

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {trimmedLength < MIN_LENGTH
            ? t("minChars", { count: MIN_LENGTH - trimmedLength })
            : t("charCount", { count: trimmedLength, max: MAX_LENGTH })}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="rounded-xl"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </div>
  );
}
