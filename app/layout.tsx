import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { getClerkLocalization } from "@/lib/clerk-localization";

import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { PushNotificationsSetup } from "@/components/push-notifications-setup";
import { InstallPrompt } from "@/components/install-prompt";
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
    icons: {
      apple: "/icons/icon-192.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#E8674C",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const clerkLocalization = getClerkLocalization(locale);

  return (
    <html
      lang={locale}
      className={`${bricolageGrotesque.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider localization={clerkLocalization}>
          <NextIntlClientProvider messages={messages}>
            <InstallPrompt />
            <PushNotificationsSetup />
            {children}
            <Toaster richColors position="top-center" />
            <ServiceWorkerRegister />
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
