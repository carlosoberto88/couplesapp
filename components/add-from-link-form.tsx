"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, Loader2 } from "lucide-react";

import type { LinkPreviewData } from "@/lib/persist-item";
import { fetchLinkPreview } from "@/lib/persist-item";
import type { ItemPriority } from "@/lib/types";
import { WishlistExtraFields } from "@/components/wishlist-extra-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AddFromLinkFormProps = {
  listId: string;
  pending?: boolean;
  onConfirm: (
    previewToken: string,
    preview: LinkPreviewData,
    priority: ItemPriority | null,
  ) => Promise<boolean>;
  onManualAdd?: () => void;
  variant?: "default" | "sticky";
};

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/.+/i.test(value.trim());
}

function formatPrice(price: number | null, currency: string | null): string | null {
  if (price === null) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
    }).format(price);
  } catch {
    return `${currency ?? "USD"} ${price.toFixed(2)}`;
  }
}

export function AddFromLinkForm({
  listId,
  pending = false,
  onConfirm,
  onManualAdd,
  variant = "default",
}: AddFromLinkFormProps) {
  const t = useTranslations("addFromLink");
  const sticky = variant === "sticky";
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [priority, setPriority] = useState<ItemPriority | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const resetForm = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    setUrl("");
    setPreview(null);
    setError(null);
    setLoading(false);
    setPriority(null);
  }, []);

  const resetPreview = useCallback(() => {
    setPreview(null);
    setError(null);
    setPriority(null);
  }, []);

  const loadPreview = useCallback(
    async (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!looksLikeUrl(trimmed)) {
        resetPreview();
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      setPreview(null);
      setPriority(null);

      const { preview: nextPreview, error: previewError } = await fetchLinkPreview(
        listId,
        trimmed,
      );

      if (requestId !== requestIdRef.current) return;

      setLoading(false);

      if (previewError || !nextPreview) {
        setError(previewError ?? "preview_failed");
        return;
      }

      setPreview(nextPreview);
    },
    [listId, resetPreview],
  );

  const schedulePreview = useCallback(
    (nextUrl: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!nextUrl.trim()) {
        resetPreview();
        setLoading(false);
        return;
      }

      debounceRef.current = setTimeout(() => {
        void loadPreview(nextUrl);
      }, 500);
    },
    [loadPreview, resetPreview],
  );

  function handleUrlChange(value: string) {
    setUrl(value);
    schedulePreview(value);
  }

  const handleConfirm = useCallback(async () => {
    if (!preview || pending || loading) return;

    const ok = await onConfirm(preview.previewToken, preview, priority);
    if (ok) resetForm();
  }, [preview, pending, loading, onConfirm, priority, resetForm]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || loading) return;

    if (preview) {
      void handleConfirm();
      return;
    }

    if (looksLikeUrl(url)) {
      void loadPreview(url);
    }
  }

  function handleCancelPreview() {
    setUrl("");
    resetPreview();
  }

  const priceLabel = preview ? formatPrice(preview.price, preview.currency) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        sticky ? "gap-2" : "rounded-2xl border border-border bg-card p-4",
      )}
    >
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <Input
          className={cn("rounded-xl", sticky ? "h-11 flex-1" : "h-11")}
          type="url"
          inputMode="url"
          placeholder={t("urlPlaceholder")}
          value={url}
          onChange={(event) => handleUrlChange(event.target.value)}
          disabled={pending}
          aria-label={t("urlAriaLabel")}
        />
        <Button
          type="submit"
          className="rounded-xl"
          disabled={pending || loading || (!preview && !looksLikeUrl(url))}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("loading")}
            </>
          ) : preview ? (
            t("confirmAdd")
          ) : (
            <>
              <Link2 className="size-4" aria-hidden />
              {t("preview")}
            </>
          )}
        </Button>
      </form>

      {loading ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="size-14 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-start gap-3">
            {preview.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.imageUrl}
                alt={t("previewImageAlt", { name: preview.name })}
                className="size-14 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Link2 className="size-5 text-muted-foreground" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-foreground">{preview.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[priceLabel, preview.hostname].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <WishlistExtraFields
            price=""
            priority={priority}
            pending={pending}
            compact
            showPrice={false}
            onPriceChange={() => {}}
            onPriorityChange={setPriority}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              disabled={pending}
              onClick={() => void handleConfirm()}
            >
              {pending ? t("adding") : t("addToList")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              disabled={pending}
              onClick={handleCancelPreview}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p>{t("previewError")}</p>
          {onManualAdd ? (
            <button
              type="button"
              className="mt-1 underline underline-offset-2"
              onClick={onManualAdd}
            >
              {t("manualFallback")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
