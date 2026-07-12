export function formatRelativeTime(iso: string, locale: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return locale === "es" ? "ahora" : "just now";
  if (minutes < 60) return locale === "es" ? `hace ${minutes} min` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "es" ? `hace ${hours} h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === "es" ? `hace ${days} d` : `${days}d ago`;
}
