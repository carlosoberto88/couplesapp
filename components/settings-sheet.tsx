"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, BookOpen, Download, Globe, MessageSquare, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";

import { locales, type Locale } from "@/i18n/config";
import { isPushSupported, urlBase64ToUint8Array } from "@/lib/push-client";
import { useSupabaseClient } from "@/lib/supabase/client";
import { FeedbackForm } from "@/components/feedback-form";
import { PartnerPanel } from "@/components/partner-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type SettingsSheetProps = {
  currentLocale: string;
};

export function SettingsSheet({ currentLocale }: SettingsSheetProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const [open, setOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<NotificationPermission | "unsupported">("default");
  const [pushPending, setPushPending] = useState(false);
  const [localePending, setLocalePending] = useState(false);
  const [tutorialPending, setTutorialPending] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!isPushSupported()) {
      setPushStatus("unsupported");
      return;
    }
    setPushStatus(Notification.permission);
  }, [open]);

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
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

  async function changeLocale(locale: Locale) {
    if (locale === currentLocale) return;
    setLocalePending(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      router.refresh();
    } finally {
      setLocalePending(false);
    }
  }

  async function installApp() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  async function replayTutorial() {
    if (!user?.id) return;

    setTutorialPending(true);
    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_version: 0 })
      .eq("id", user.id);
    setTutorialPending(false);

    if (error) {
      toast.error(t("replayError"));
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            aria-label={t("open")}
          >
            <Settings className="size-5" />
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <PartnerPanel />

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Bell className="size-4" />
              {t("notifications")}
            </h3>
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

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Globe className="size-4" />
              {t("language")}
            </h3>
            <div className="inline-flex w-fit gap-1 rounded-full bg-muted p-1">
              {locales.map((locale) => (
                <button
                  key={locale}
                  type="button"
                  disabled={localePending}
                  aria-pressed={currentLocale === locale}
                  onClick={() => void changeLocale(locale)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    currentLocale === locale
                      ? "bg-duo-coral-tint text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {locale === "en" ? t("english") : t("spanish")}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MessageSquare className="size-4" />
              {t("feedback.title")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("feedback.description")}</p>
            <FeedbackForm />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BookOpen className="size-4" />
              {t("showTutorial")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("showTutorialHint")}</p>
            <Button
              type="button"
              variant="secondary"
              className="w-fit rounded-xl"
              disabled={tutorialPending}
              onClick={() => void replayTutorial()}
            >
              {t("showTutorial")}
            </Button>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Download className="size-4" />
              {t("install")}
            </h3>
            {installEvent ? (
              <Button type="button" className="w-fit rounded-xl" onClick={() => void installApp()}>
                {t("installAction")}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{t("installHint")}</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
