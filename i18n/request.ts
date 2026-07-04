import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";

import { defaultLocale, isLocale, locales, type Locale } from "./config";

function negotiateLocale(acceptLanguage: string): Locale {
  const languages = new Negotiator({
    headers: { "accept-language": acceptLanguage },
  }).languages();

  const matched = match(languages, [...locales], defaultLocale);
  return isLocale(matched) ? matched : defaultLocale;
}

export default getRequestConfig(async () => {
  const headersList = await headers();
  const locale = negotiateLocale(headersList.get("accept-language") ?? "");

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
