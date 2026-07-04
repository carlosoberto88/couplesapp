import type { MemberColor } from "@/lib/member-colors";
import { cn } from "@/lib/utils";

/** Best-effort initial for a member avatar: display name first, then email, then "?". */
export function initialsFor(profile: { display_name: string | null; email: string } | null): string {
  if (!profile) return "?";
  const source = profile.display_name?.trim() || profile.email;
  return source ? source.charAt(0).toUpperCase() : "?";
}

type MemberAvatarProps = {
  initials: string;
  color: MemberColor;
  className?: string;
  title?: string;
};

/** Small colored-initial circle used to represent a list member's identity. */
export function MemberAvatar({ initials, color, className, title }: MemberAvatarProps) {
  return (
    <span
      title={title}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-card",
        className,
      )}
      style={{ backgroundColor: color.tint, color: color.color }}
    >
      {initials}
    </span>
  );
}
