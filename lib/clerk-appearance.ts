import { dark } from "@clerk/themes";

/**
 * Shared "His & Hers" theming for embedded Clerk components (SignIn, SignUp,
 * UserButton). Uses the `appearance` prop's `variables`/`elements` escape
 * hatches rather than the `@clerk/ui` shadcn theme package — this repo's
 * shadcn primitives are base-ui flavored, which that theme doesn't target.
 *
 * `isDark` should mirror next-themes' resolved theme so the popover follows
 * the app's OS-driven light/dark mode instead of always rendering light.
 *
 * Untyped here (inferred structurally) — Clerk's `Appearance`/`Theme` type is
 * supplied via global module augmentation from `@clerk/react`, which isn't a
 * direct dependency of this app (only `@clerk/nextjs` is); the component
 * callsites (which do import from `@clerk/nextjs`) type-check this object
 * against the real `appearance` prop shape.
 */
export const clerkAppearance = (isDark: boolean) => ({
  baseTheme: isDark ? dark : undefined,
  variables: {
    // keep in sync with app/globals.css :root / .dark
    colorPrimary: "#5b5be0",
    colorBackground: isDark ? "#15161c" : "#f4f4f2",
    fontFamily: "var(--font-inter)",
    fontFamilyButtons: "var(--font-inter)",
    borderRadius: "1rem",
  },
  elements: {
    card: "rounded-2xl border border-border shadow-none",
    headerTitle: "font-[var(--font-bricolage)]",
    formButtonPrimary: "rounded-full",
    socialButtonsBlockButton: "rounded-full",
    formFieldInput: "rounded-xl",
    footerActionLink: "text-primary hover:text-primary",
    userButtonAvatarBox: "rounded-full",
    userButtonTrigger: "rounded-full",
    userButtonPopoverCard:
      "rounded-xl border border-border shadow-md overflow-hidden",
    userButtonPopoverMain: "rounded-xl bg-popover",
    userButtonPopoverFooter: "rounded-b-xl bg-popover",
    userButtonPopoverActionButton: "rounded-lg hover:bg-accent",
  },
});
