import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function DatesLoading() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95">
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

        <ul className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <Card className="rounded-2xl">
                <CardContent className="flex items-center gap-3 py-2.5">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="size-11 shrink-0 rounded-xl" />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
