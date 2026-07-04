import { ClerkProvider } from "@clerk/nextjs";
import { enUS, esES } from "@clerk/localizations";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export const viewport: Viewport = {
  themeColor: "#FBF7F2",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const clerkLocalization = locale === "es" ? esES : enUS;

  return (
    <html
      lang={locale}
      className={`${bricolageGrotesque.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider localization={clerkLocalization}>
          <NextIntlClientProvider messages={messages}>
            {children}
            <Toaster richColors position="top-center" />
            <ServiceWorkerRegister />
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
