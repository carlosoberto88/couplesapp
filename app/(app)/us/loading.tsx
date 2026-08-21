import { Skeleton } from "@/components/ui/skeleton";

export default function UsLoading() {
  return (
    <>
      <header className="glass-chrome sticky top-0 z-40 border-b border-border pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between gap-2 px-4">
          <Skeleton className="h-6 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 p-4 pb-bottom-nav">
        <div className="flex flex-col items-center gap-3 rounded-lg bg-card px-4 py-8 shadow-[0_0_0_1px_var(--border)]">
          <Skeleton className="size-[72px] rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </main>
    </>
  );
}
