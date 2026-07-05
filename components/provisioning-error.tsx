"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type ProvisioningErrorProps = {
  message?: string;
};

export function ProvisioningError({ message }: ProvisioningErrorProps) {
  const t = useTranslations("errors");

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-display text-lg font-semibold text-foreground">{t("setupTitle")}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {message ?? t("setupDescription")}
      </p>
      <Button type="button" className="rounded-xl" onClick={() => window.location.reload()}>
        {t("retry")}
      </Button>
    </main>
  );
}
