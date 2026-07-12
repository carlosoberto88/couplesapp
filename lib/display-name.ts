export type Identifiable = {
  username?: string | null;
  display_name?: string | null;
  email?: string | null;
};

export function displayNameFor(
  profile: Identifiable | null | undefined,
  fallback = "?",
): string {
  return (
    profile?.username?.trim() ||
    profile?.display_name?.trim() ||
    profile?.email?.trim() ||
    fallback
  );
}

export function initialFor(
  profile: Identifiable | null | undefined,
  fallback = "?",
): string {
  const name = displayNameFor(profile, fallback);
  const char = name.match(/[a-z0-9]/i)?.[0] ?? name.charAt(0);
  return char.toUpperCase();
}
