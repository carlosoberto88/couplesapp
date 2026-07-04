import { createTranslator } from "next-intl";

import { getLocaleFromRequest } from "@/lib/get-locale-from-request";

export async function getApiTranslator(request: Request) {
  const locale = getLocaleFromRequest(request);
  const messages = (await import(`../messages/${locale}.json`)).default;
  return createTranslator({ locale, messages });
}
