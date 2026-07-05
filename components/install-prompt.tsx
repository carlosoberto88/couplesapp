"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const DISMISS_KEY = "couples-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const t = useTranslations("install");
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!visible || !event) return null;

  async function install() {
    await event!.prompt();
    await event!.userChoice;
    setVisible(false);
    setEvent(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="border-b border-border bg-duo-coral-tint/40 px-4 py-3 safe-area-top">
      <div className="mx-auto flex w-full max-w-[640px] items-start gap-3">
        <Download className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{t("title")}</p>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" className="rounded-xl" onClick={() => void install()}>
              {t("action")}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="rounded-xl" onClick={dismiss}>
              {t("dismiss")}
            </Button>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} aria-label={t("dismiss")}>
          <X />
        </Button>
      </div>
    </div>
  );
}
