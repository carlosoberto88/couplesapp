/**
 * Shared "His & Hers" theming for embedded Clerk components (SignIn, SignUp,
 * UserButton). Uses the `appearance` prop's `variables`/`elements` escape
 * hatches rather than the `@clerk/ui` shadcn theme package — this repo's
 * shadcn primitives are base-ui flavored, which that theme doesn't target.
 *
 * Untyped here (inferred structurally) — Clerk's `Appearance`/`Theme` type is
 * supplied via global module augmentation from `@clerk/react`, which isn't a
 * direct dependency of this app (only `@clerk/nextjs` is); the component
 * callsites (which do import from `@clerk/nextjs`) type-check this object
 * against the real `appearance` prop shape.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#e8674c",
    colorBackground: "#FBF7F2",
    fontFamily: "var(--font-inter)",
    fontFamilyButtons: "var(--font-inter)",
    borderRadius: "9999px",
  },
  elements: {
    card: "rounded-2xl border border-border shadow-none",
    headerTitle: "font-[var(--font-bricolage)]",
    formButtonPrimary: "rounded-full",
    socialButtonsBlockButton: "rounded-full",
    formFieldInput: "rounded-xl",
    footerActionLink: "text-primary hover:text-primary",
  },
};
