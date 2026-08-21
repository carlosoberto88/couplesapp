import { Skeleton } from "@/components/ui/skeleton";

export default function ListDetailLoading() {
  return (
    <>
      <header className="glass-chrome sticky top-0 z-40 border-b border-border pt-safe">
        <div className="h-14 w-full" />
      </header>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 px-4 pb-8 pt-4">
        <Skeleton className="h-4 w-16" />

        <div className="flex items-center gap-3">
          <Skeleton className="size-11 shrink-0 rounded-xl" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="flex shrink-0 -space-x-2">
            <Skeleton className="size-7 rounded-full ring-2 ring-card" />
            <Skeleton className="size-7 rounded-full ring-2 ring-card" />
          </div>
        </div>

        <Skeleton className="h-11 w-full rounded-full" />

        <div className="flex items-center justify-between px-1">
          <Skeleton className="h-3 w-14" />
        </div>

        <ul className="list-group [--row-inset:3.75rem]">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="flex min-h-11 items-center gap-3 px-3.5 py-2.5"
            >
              <Skeleton className="size-2 shrink-0 rounded-full" />
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
