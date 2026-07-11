"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUser } from "@clerk/nextjs";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import { useRealtimeNotifications } from "@/lib/use-realtime-notifications";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mirrors list-activity-strip.tsx's inline helper — not extracted to avoid
// touching that component just for reuse.
function formatRelativeTime(iso: string, locale: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return locale === "es" ? "ahora" : "just now";
  if (minutes < 60) return locale === "es" ? `hace ${minutes} min` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "es" ? `hace ${hours} h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === "es" ? `hace ${days} d` : `${days}d ago`;
}

// The `url` column is user-editable on the reader's own row, so it must never
// be treated as a trusted redirect target — only same-origin absolute paths.
function isInternalPath(url: string | null): url is string {
  return !!url && url.startsWith("/") && !url.startsWith("//");
}

export function NotificationBell() {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const router = useRouter();
  const t = useTranslations("notifications");

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const locale =
    typeof document !== "undefined" ? document.documentElement.lang || "en" : "en";

  // Used by the realtime hook's onRefetch handler (focus/visibility/reconnect
  // resync). The mount effect below duplicates this query inline because the
  // set-state-in-effect lint rule flags effects that call an outer-scope
  // function which sets state.
  async function fetchNotifications() {
    if (!user?.id) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications(data ?? []);
  }

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!cancelled) setNotifications(data ?? []);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, user?.id]);

  useRealtimeNotifications({
    userId: user?.id,
    onInsert: (row) => {
      setNotifications((prev) => [row, ...prev].slice(0, 30));
      toast(row.title, { description: row.body ?? undefined });
    },
    onUpdate: (row) => {
      setNotifications((prev) => prev.map((n) => (n.id === row.id ? row : n)));
    },
    onRefetch: () => void fetchNotifications(),
  });

  const unreadCount = notifications.filter((n) => n.read_at === null).length;

  async function markRead(id: string) {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    await supabase.from("notifications").update({ read_at: now }).eq("id", id);
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.read_at === null ? { ...n, read_at: now } : n)));
    await supabase.from("notifications").update({ read_at: now }).is("read_at", null);
  }

  function handleSelect(notification: Notification) {
    if (notification.read_at === null) void markRead(notification.id);
    if (isInternalPath(notification.url)) router.push(notification.url);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative size-9 rounded-full"
            aria-label={t("bellLabel")}
          />
        }
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full px-1 text-[10px] leading-none"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 rounded-xl p-0">
        <div className="flex items-center justify-between px-2.5 py-2">
          <span className="text-sm font-medium text-foreground">{t("title")}</span>
          {unreadCount > 0 ? (
            <DropdownMenuItem
              closeOnClick={false}
              className="w-fit px-1.5 py-0.5 text-xs font-medium text-primary"
              onClick={() => void markAllRead()}
            >
              {t("markAllRead")}
            </DropdownMenuItem>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="flex max-h-96 flex-col overflow-y-auto p-1">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "flex-col items-stretch gap-0.5 rounded-lg py-1.5",
                  notification.read_at === null && "bg-duo-coral-tint/40",
                )}
                onClick={() => handleSelect(notification)}
              >
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  {notification.read_at === null ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  ) : null}
                  {notification.title}
                </span>
                {notification.body ? (
                  <span className="text-muted-foreground">{notification.body}</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(notification.created_at, locale)}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
