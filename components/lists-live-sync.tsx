"use client";

import { useRealtimeListsIndex } from "@/lib/use-realtime-lists";

export function ListsLiveSync({ userId }: { userId: string | null | undefined }) {
  useRealtimeListsIndex(userId);
  return null;
}
