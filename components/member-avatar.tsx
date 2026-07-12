import type { MemberColor } from "@/lib/member-colors";
import { cn } from "@/lib/utils";
import { initialFor, type Identifiable } from "@/lib/display-name";

/** Best-effort initial for a member avatar: username first, then display name, then email, then "?". */
export function initialsFor(profile: Identifiable | null): string {
  return initialFor(profile);
}

type MemberAvatarProps = {
  initials: string;
  color: MemberColor;
  className?: string;
  /** Required: the member's display name, exposed to assistive tech and as a hover tooltip. An avatar must never be anonymous. */
  title: string;
};

/**
 * Small colored-initial circle used to represent a list member's identity.
 *
 * The member's hue lives in the tint background and the accent-colored ring;
 * the initials themselves render in `--foreground` rather than `color.color`
 * so they stay AA-legible (>= 4.5:1) on every tint in both light and dark
 * mode — `color.color` alone doesn't reliably clear that bar against its
 * paired tint.
 */
export function MemberAvatar({ initials, color, className, title }: MemberAvatarProps) {
  return (
    <span
      title={title}
      aria-label={title}
      role="img"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-foreground ring-2 ring-card",
        className,
      )}
      style={{ backgroundColor: color.tint, boxShadow: `inset 0 0 0 1.5px ${color.color}` }}
    >
      {initials}
    </span>
  );
}
