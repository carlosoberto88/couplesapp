import { getLocale, getTranslations } from "next-intl/server";

import { AppBar } from "@/components/app-bar";
import { AppBarActions } from "@/components/app-bar-actions";
import { AccountSection } from "@/components/settings/account-section";
import { PreferencesSection } from "@/components/settings/preferences-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { HelpAboutSection } from "@/components/settings/help-about-section";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const locale = await getLocale();

  return (
    <>
      <AppBar>
        <AppBarActions />
      </AppBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 p-4 pb-bottom-nav">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("groupAccount")}
          </h2>
          <AccountSection />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("groupPreferences")}
          </h2>
          <PreferencesSection currentLocale={locale} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("groupNotifications")}
          </h2>
          <NotificationsSection />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("groupHelp")}
          </h2>
          <HelpAboutSection />
        </section>
      </main>
    </>
  );
}
