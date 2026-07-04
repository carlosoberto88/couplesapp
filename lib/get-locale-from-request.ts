import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

import { defaultLocale, isLocale, locales, type Locale } from "@/i18n/config";

export function getLocaleFromRequest(request: Request): Locale {
  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const languages = new Negotiator({
    headers: { "accept-language": acceptLanguage },
  }).languages();
  const matched = match(languages, [...locales], defaultLocale);
  return isLocale(matched) ? matched : defaultLocale;
}
