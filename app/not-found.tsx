import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-display text-lg font-semibold text-foreground">{t("notFoundTitle")}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{t("notFoundDescription")}</p>
      <Button nativeButton={false} render={<Link href="/lists" />}>
        {t("backToLists")}
      </Button>
    </main>
  );
}
