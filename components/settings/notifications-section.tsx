"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { isPushSupported, urlBase64ToUint8Array } from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function NotificationsSection() {
  const t = useTranslations("settings");
  const [pushStatus, setPushStatus] = useState<NotificationPermission | "unsupported">("default");
  const [pushPending, setPushPending] = useState(false);

  useEffect(() => {
    // Push permission can only be read client-side; sync it into state once mounted.
    if (!isPushSupported()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPushStatus("unsupported");
      return;
    }
    setPushStatus(Notification.permission);
  }, []);

  async function enablePush() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey || !isPushSupported()) return;

    setPushPending(true);
    try {
      const permission = await Notification.requestPermission();
      setPushStatus(permission);
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = subscription.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
    } finally {
      setPushPending(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="py-2">
        <section className="flex flex-col gap-2">
          {pushStatus === "unsupported" ? (
            <p className="text-sm text-muted-foreground">{t("pushUnsupported")}</p>
          ) : pushStatus === "granted" ? (
            <p className="text-sm text-muted-foreground">{t("pushEnabled")}</p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="w-fit rounded-xl"
              disabled={pushPending}
              onClick={() => void enablePush()}
            >
              {pushPending ? t("pushEnabling") : t("pushEnable")}
            </Button>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
