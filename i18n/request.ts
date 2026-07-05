import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";

import { LOCALE_COOKIE } from "@/lib/locale-cookie";

import { defaultLocale, isLocale, locales, type Locale } from "./config";

function negotiateLocale(acceptLanguage: string): Locale {
  const languages = new Negotiator({
    headers: { "accept-language": acceptLanguage },
  }).languages();

  const matched = match(languages, [...locales], defaultLocale);
  return isLocale(matched) ? matched : defaultLocale;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  if (cookieLocale && isLocale(cookieLocale)) {
    return {
      locale: cookieLocale,
      messages: (await import(`../messages/${cookieLocale}.json`)).default,
    };
  }

  const headersList = await headers();
  const locale = negotiateLocale(headersList.get("accept-language") ?? "");

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
