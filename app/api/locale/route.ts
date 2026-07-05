import { NextRequest, NextResponse } from "next/server";

import { isLocale } from "@/i18n/config";
import { LOCALE_COOKIE } from "@/lib/locale-cookie";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const locale = typeof body?.locale === "string" ? body.locale : null;

  if (!locale || !isLocale(locale)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, locale });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return response;
}
