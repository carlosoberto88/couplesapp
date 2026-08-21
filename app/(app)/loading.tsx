import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <>
      <header className="glass-chrome sticky top-0 z-40 border-b border-border pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between gap-2 px-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 p-4 pb-bottom-nav">
        <Skeleton className="h-9 w-40 rounded-full" />
        <ul className="list-group [--row-inset:4.625rem]">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index} className="flex min-h-11 items-center gap-4 px-3.5 py-2.5">
              <Skeleton className="size-11 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </li>
          ))}
        </ul>
      </main>
      <nav
        aria-hidden
        className="glass-chrome fixed inset-x-0 bottom-0 z-40 border-t border-border md:mx-auto md:max-w-[var(--app-frame)] md:border-x"
      >
        <div className="mx-auto flex h-16 w-full max-w-[640px] items-stretch px-2 pb-safe">
          <Skeleton className="m-auto h-9 w-24 rounded-full" />
        </div>
      </nav>
    </>
  );
}
