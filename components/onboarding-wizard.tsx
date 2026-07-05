"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import { type ListTypeKey } from "@/lib/list-types";
import { CreateListForm } from "@/components/create-list-form";
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

const TOTAL_STEPS = 4;

type OnboardingWizardProps = {
  show: boolean;
};

export function OnboardingWizard({ show }: OnboardingWizardProps) {
  const router = useRouter();
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const t = useTranslations("onboarding");
  const tCreate = useTranslations("createList");

  const [open, setOpen] = useState(show);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [type, setType] = useState<ListTypeKey>("shopping");
  const [listId, setListId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!show && !open) return null;

  async function completeOnboarding() {
    if (!user?.id) return;

    setSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id);
    setSubmitting(false);

    if (error) {
      toast.error(t("completeError"));
      return;
    }

    setOpen(false);
    router.refresh();
  }

  async function handleCreateAndNext() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    const { data, error } = await supabase.rpc("create_list", {
      p_name: trimmed,
      p_type: type,
    });
    setSubmitting(false);

    if (error || !data) {
      toast.error(error?.message ?? tCreate("error"));
      return;
    }

    setListId(data);
    setStep(3);
  }

  function handleOpenChange(next: boolean) {
    if (!next && open) {
      void completeOnboarding();
      return;
    }
    setOpen(next);
  }

  function handleNext() {
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      void handleCreateAndNext();
      return;
    }
    if (step === 3) {
      setStep(4);
      return;
    }
    void completeOnboarding();
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  const stepTitle =
    step === 1
      ? t("welcomeTitle")
      : step === 2
        ? t("createTitle")
        : step === 3
          ? t("inviteTitle")
          : t("itemsTitle");

  const stepDescription =
    step === 1
      ? t("welcomeDescription")
      : step === 2
        ? t("createDescription")
        : step === 3
          ? t("inviteDescription")
          : t("itemsDescription");

  const stepIcon =
    step === 1 ? "💑" : step === 2 ? "📋" : step === 3 ? "✉️" : "✅";

  const nextDisabled = submitting || (step === 2 && !name.trim());
  const nextLabel =
    step === 4 ? t("getStarted") : step === 2 && submitting ? tCreate("creating") : t("next");

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

        {step === 2 ? (
          <CreateListForm
            name={name}
            onNameChange={setName}
            type={type}
            onTypeChange={setType}
            nameInputId="onboarding-list-name"
            autoFocus
          />
        ) : null}

        {step === 3 && listId ? (
          <Link
            href={`/lists/${listId}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("openList")}
          </Link>
        ) : null}

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
              disabled={nextDisabled}
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
