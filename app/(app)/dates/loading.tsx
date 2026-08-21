import { Skeleton } from "@/components/ui/skeleton";

export default function DatesLoading() {
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
        <div className="flex justify-end">
          <Skeleton className="h-11 w-32 rounded-xl" />
        </div>

        <ul className="list-group [--row-inset:0.875rem]">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <div className="flex min-h-11 items-center gap-3 px-3.5 py-2.5">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="size-11 shrink-0 rounded-xl" />
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
