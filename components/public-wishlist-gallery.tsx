"use client";

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeExternalUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

export type PublicWishlistItem = {
  id: string;
  name: string;
  note: string | null;
  url: string | null;
  price: number | null;
  currency: string | null;
  priority: "must_have" | "nice_to_have" | null;
  isReserved: boolean;
  imageUrl: string | null;
};

type PublicWishlistGalleryProps = {
  token: string;
  items: PublicWishlistItem[];
};

function guestReservationKey(itemId: string): string {
  return `couples:guestReservation:${itemId}`;
}

type ReserveResponse = { ok: true; secret: string } | { ok: false; reason: "already_reserved" | "invalid" };
type ReleaseResponse = { ok: boolean };

export function PublicWishlistGallery({ token, items: initialItems }: PublicWishlistGalleryProps) {
  const t = useTranslations("publicWishlist");
  const [items, setItems] = useState(initialItems);
  const [mineIds, setMineIds] = useState<Set<string>>(new Set());
  const [guestLabels, setGuestLabels] = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const mine = new Set<string>();
    for (const item of initialItems) {
      if (localStorage.getItem(guestReservationKey(item.id))) {
        mine.add(item.id);
      }
    }
    setMineIds(mine);
  }, [initialItems]);

  const setPending = useCallback((itemId: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const handleReserve = useCallback(
    async (itemId: string) => {
      setPending(itemId, true);
      try {
        const res = await fetch("/api/public/wishlist/reserve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            itemId,
            guestLabel: guestLabels[itemId]?.trim() || undefined,
          }),
        });
        const data = (await res.json().catch(() => null)) as ReserveResponse | null;

        if (data?.ok) {
          localStorage.setItem(guestReservationKey(itemId), data.secret);
          setMineIds((prev) => new Set(prev).add(itemId));
          setItems((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, isReserved: true } : item)),
          );
          toast.success(t("reserveSuccess"));
        } else if (data?.reason === "already_reserved") {
          setItems((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, isReserved: true } : item)),
          );
          toast.error(t("alreadyReserved"));
        } else {
          toast.error(t("reserveFailed"));
        }
      } catch {
        toast.error(t("reserveFailed"));
      } finally {
        setPending(itemId, false);
      }
    },
    [guestLabels, setPending, t, token],
  );

  const handleRelease = useCallback(
    async (itemId: string) => {
      const secret = localStorage.getItem(guestReservationKey(itemId));
      if (!secret) return;

      setPending(itemId, true);
      try {
        const res = await fetch("/api/public/wishlist/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, secret }),
        });
        const data = (await res.json().catch(() => null)) as ReleaseResponse | null;

        if (data?.ok) {
          localStorage.removeItem(guestReservationKey(itemId));
          setMineIds((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
          setItems((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, isReserved: false } : item)),
          );
        } else {
          toast.error(t("releaseFailed"));
        }
      } catch {
        toast.error(t("releaseFailed"));
      } finally {
        setPending(itemId, false);
      }
    },
    [setPending, t],
  );

  return (
    <ul className="grid grid-cols-2 gap-4">
      {items.map((item) => {
        const isMine = mineIds.has(item.id);
        const isPending = pendingIds.has(item.id);
        const canReserve = !item.isReserved;
        const canRelease = item.isReserved && isMine;
        const safeUrl = safeExternalUrl(item.url);

        return (
          <li
            key={item.id}
            className="animate-item-in overflow-hidden rounded-2xl border border-border bg-card"
          >
            <div className="relative aspect-square w-full">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center bg-duo-coral-tint text-3xl">
                  🎁
                </div>
              )}

              {item.priority === "must_have" && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-duo-coral bg-duo-coral-tint px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
                  <Star className="size-3 fill-duo-coral text-duo-coral" aria-hidden />
                  {t("priorityMustHave")}
                </span>
              )}

              {item.isReserved && (
                <div className="absolute inset-x-0 bottom-0 flex justify-start bg-gradient-to-t from-foreground/60 to-transparent p-2 pt-6">
                  <Badge>{isMine ? t("reservedByYou") : t("reserved")}</Badge>
                </div>
              )}
            </div>

            <div className="p-2.5">
              <p className="line-clamp-2 font-medium text-foreground">{item.name}</p>
              {item.price !== null && (
                <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
                  {item.currency ?? "USD"} {item.price.toFixed(2)}
                </p>
              )}
              {safeUrl && (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-1.5 block truncate text-xs text-duo-coral hover:underline"
                >
                  {item.url}
                </a>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border px-2.5 py-2">
              {canReserve && (
                <>
                  <Input
                    value={guestLabels[item.id] ?? ""}
                    onChange={(e) =>
                      setGuestLabels((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    placeholder={t("guestLabelPlaceholder")}
                    maxLength={80}
                    disabled={isPending}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className={cn("w-full")}
                    disabled={isPending}
                    onClick={() => void handleReserve(item.id)}
                  >
                    {t("reserveCta")}
                  </Button>
                </>
              )}
              {canRelease && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isPending}
                  onClick={() => void handleRelease(item.id)}
                >
                  {t("releaseCta")}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
