"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe, Laptop, Moon, Sun, SunMoon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { locales, type Locale } from "@/i18n/config";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const themes = [
  { value: "system", icon: Laptop },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
] as const;

type PreferencesSectionProps = {
  currentLocale: string;
};

export function PreferencesSection({ currentLocale }: PreferencesSectionProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [localePending, setLocalePending] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // next-themes needs a client-only mount flag so SSR and first client
    // render match before theme-dependent UI is shown.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  async function changeLocale(locale: Locale) {
    if (locale === currentLocale) return;
    setLocalePending(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      router.refresh();
    } finally {
      setLocalePending(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col gap-4 py-2">
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Globe className="size-4" />
            {t("language")}
          </h3>
          <div className="inline-flex w-fit gap-1 rounded-full bg-muted p-1">
            {locales.map((locale) => (
              <button
                key={locale}
                type="button"
                disabled={localePending}
                aria-pressed={currentLocale === locale}
                onClick={() => void changeLocale(locale)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  currentLocale === locale
                    ? "bg-duo-coral-tint text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {locale === "en" ? t("english") : t("spanish")}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <SunMoon className="size-4" />
            {t("theme")}
          </h3>
          {mounted ? (
            <div className="inline-flex w-fit gap-1 rounded-full bg-muted p-1">
              {themes.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    theme === value
                      ? "bg-duo-coral-tint text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {t(`theme${value.charAt(0).toUpperCase()}${value.slice(1)}` as
                    | "themeSystem"
                    | "themeLight"
                    | "themeDark")}
                </button>
              ))}
            </div>
          ) : (
            <div className="h-9 w-full max-w-64 animate-pulse rounded-full bg-muted" />
          )}
        </section>
      </CardContent>
    </Card>
  );
}
