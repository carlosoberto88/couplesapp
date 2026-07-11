"use client";

import { useEffect } from "react";

export function MarkListSeen({ listId }: { listId: string }) {
  useEffect(() => {
    localStorage.setItem(`couples:list-seen:${listId}`, new Date().toISOString());
  }, [listId]);
  return null;
}
