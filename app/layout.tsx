import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { getClerkLocalization } from "@/lib/clerk-localization";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { PushNotificationsSetup } from "@/components/push-notifications-setup";
import { NavigationProgress } from "@/components/navigation-progress";
import "./globals.css";

// ponytail: omitting `weight` (rather than listing more static weights) is what
// makes next/font fetch the variable font — 100-900 in one file, so font-bold /
// font-semibold finally render as real weights instead of being synthesised.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
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
  // keep in sync with app/globals.css :root / .dark
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#15161c" },
    { media: "(prefers-color-scheme: light)", color: "#f4f4f2" },
  ],
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  maximumScale: 1,
  userScalable: false,
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
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClerkProvider localization={clerkLocalization}>
            <NextIntlClientProvider messages={messages}>
              <NavigationProgress />
              <PushNotificationsSetup />
              {children}
              <Toaster richColors position="top-center" />
              <ServiceWorkerRegister />
            </NextIntlClientProvider>
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
