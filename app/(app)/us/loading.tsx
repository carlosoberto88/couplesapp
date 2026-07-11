import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function UsLoading() {
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
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
