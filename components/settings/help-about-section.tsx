"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, Download, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import { FeedbackForm } from "@/components/feedback-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function HelpAboutSection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const [tutorialPending, setTutorialPending] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

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

    router.refresh();
  }

  async function installApp() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col gap-4 py-4">
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
            <MessageSquare className="size-4" />
            {t("feedback.title")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("feedback.description")}</p>
          <FeedbackForm />
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
      </CardContent>
    </Card>
  );
}
