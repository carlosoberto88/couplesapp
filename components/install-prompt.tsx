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
    <div className="border-b border-border bg-duo-coral-tint/40 px-4 pt-safe">
      <div className="mx-auto flex w-full max-w-[640px] min-h-11 items-center gap-2 py-1.5">
        <Download className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 truncate text-sm text-foreground">{t("compactTitle")}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto shrink-0 px-2 py-1 text-sm font-medium text-primary"
          onClick={() => void install()}
        >
          {t("action")}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} aria-label={t("dismiss")}>
          <X />
        </Button>
      </div>
    </div>
  );
}
