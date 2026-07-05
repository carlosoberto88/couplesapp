import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-safe backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between gap-2 px-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 p-4 pb-bottom-nav">
        <Skeleton className="h-9 w-40 rounded-full" />
        <ul className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index}>
              <Skeleton className="h-16 w-full rounded-2xl" />
            </li>
          ))}
        </ul>
      </main>
      <nav
        aria-hidden
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95"
      >
        <div className="mx-auto flex h-16 w-full max-w-[640px] items-stretch px-2 pb-safe">
          <Skeleton className="m-auto h-9 w-24 rounded-full" />
        </div>
      </nav>
    </>
  );
}
