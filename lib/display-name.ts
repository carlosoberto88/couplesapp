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
  return displayNameFor(profile, fallback).charAt(0).toUpperCase();
}
