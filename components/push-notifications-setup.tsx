"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";

import { urlBase64ToUint8Array, isPushSupported } from "@/lib/push-client";
import { Button } from "@/components/ui/button";

const PROMPT_KEY = "couples-push-prompted";

export function PushNotificationsSetup() {
  const t = useTranslations("push");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!isPushSupported()) return;
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;

    const permission = Notification.permission;
    if (permission === "granted" || permission === "denied") return;
    if (localStorage.getItem(PROMPT_KEY) === "1") return;

    setVisible(true);
  }, []);

  async function enablePush() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey || !isPushSupported()) return;

    setPending(true);
    localStorage.setItem(PROMPT_KEY, "1");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = subscription.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });

      setVisible(false);
    } catch {
      // Best-effort — user can retry later from settings if added.
    } finally {
      setPending(false);
    }
  }

  function dismiss() {
    localStorage.setItem(PROMPT_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-3 border-b border-border bg-duo-coral-tint/50 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Bell className="size-4 shrink-0 text-primary" aria-hidden />
        <span>{t("prompt")}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={dismiss}
          disabled={pending}
        >
          {t("notNow")}
        </Button>
        <Button type="button" size="sm" onClick={() => void enablePush()} disabled={pending}>
          {pending ? t("enabling") : t("enable")}
        </Button>
      </div>
    </div>
  );
}
