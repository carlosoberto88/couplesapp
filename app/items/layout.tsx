import { AuthenticatedShell } from "@/components/authenticated-shell";

export default function ItemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
