import { getTranslations } from "next-intl/server";

import { sanitizeRedirect } from "@/lib/sanitize-redirect";
import { SignInForm } from "./sign-in-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const { email, next } = await searchParams;
  const redirectUrl = sanitizeRedirect(next);
  const t = await getTranslations("auth");
  const tCommon = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background p-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="font-display text-2xl font-bold text-foreground">
          {tCommon("appName")}
          <span className="text-primary">.</span>
        </span>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
      </div>
      <SignInForm email={email} redirectUrl={redirectUrl} />
    </main>
  );
}
