"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import { ONBOARDING_VERSION } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: "💑", titleKey: "welcomeTitle", descriptionKey: "welcomeDescription" },
  { icon: "🛒", titleKey: "buildTitle", descriptionKey: "buildDescription" },
  { icon: "✅", titleKey: "liveTitle", descriptionKey: "liveDescription" },
  { icon: "🏬", titleKey: "shoppingNowTitle", descriptionKey: "shoppingNowDescription" },
  { icon: "🎉", titleKey: "datesTitle", descriptionKey: "datesDescription" },
  { icon: "💞", titleKey: "usTitle", descriptionKey: "usDescription" },
  { icon: "🎁", titleKey: "shareTitle", descriptionKey: "shareDescription" },
] as const;

const TOTAL_STEPS = STEPS.length;

type OnboardingWizardProps = {
  show: boolean;
};

export function OnboardingWizard({ show }: OnboardingWizardProps) {
  const router = useRouter();
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const t = useTranslations("onboarding");

  const [open, setOpen] = useState(show);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  if (!show && !open) return null;

  async function completeOnboarding() {
    if (!user?.id) return;

    setSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        onboarding_completed_at: new Date().toISOString(),
        onboarding_version: ONBOARDING_VERSION,
      })
      .eq("id", user.id);
    setSubmitting(false);

    if (error) {
      toast.error(t("completeError"));
      return;
    }

    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(next: boolean) {
    if (!next && open) {
      void completeOnboarding();
      return;
    }
    setOpen(next);
  }

  function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }
    void completeOnboarding();
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  const currentStep = STEPS[step - 1];
  const stepTitle = t(currentStep.titleKey);
  const stepDescription = t(currentStep.descriptionKey);
  const stepIcon = currentStep.icon;

  const nextLabel = step === TOTAL_STEPS ? t("getStarted") : t("next");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-2xl bg-card sm:max-w-md">
        <DialogHeader>
          <p className="text-xs font-medium text-muted-foreground">
            {t("stepOf", { step, total: TOTAL_STEPS })}
          </p>
          <div className="flex gap-1.5 pt-1">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  i < step ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-2xl">
            {stepIcon}
          </div>
          <DialogTitle className="font-display text-lg">{stepTitle}</DialogTitle>
          <DialogDescription>{stepDescription}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex w-full gap-2">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                disabled={submitting}
                onClick={handleBack}
              >
                {t("back")}
              </Button>
            ) : null}
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl"
              disabled={submitting}
              onClick={() => void handleNext()}
            >
              {nextLabel}
            </Button>
          </div>
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            disabled={submitting}
            onClick={() => void completeOnboarding()}
          >
            {t("skip")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
