import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardDescription, CardContent } from "@/components/ui/card";

export default async function NoAccessPage() {
  const t = await getTranslations("noAccess");
  const tCommon = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background p-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="font-display text-2xl font-bold text-foreground">
          {tCommon("appName")}
          <span className="text-primary">.</span>
        </span>
      </div>
      <Card className="w-full max-w-sm rounded-2xl border border-border ring-0">
        <CardHeader className="items-center text-center">
          <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-duo-coral-tint text-primary">
            <LockIcon />
          </div>
          <h1 className="font-display text-xl font-semibold text-foreground">
            {t("title")}
          </h1>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="h-11 w-full rounded-full text-base"
            render={<Link href="/lists" />}
          >
            {t("backToLists")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
