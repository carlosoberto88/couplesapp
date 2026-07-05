"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-display text-lg font-semibold text-foreground">{t("genericTitle")}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{t("genericDescription")}</p>
      <Button type="button" className="rounded-xl" onClick={reset}>
        {t("retry")}
      </Button>
    </main>
  );
}
