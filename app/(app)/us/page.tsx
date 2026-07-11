import { AppBar } from "@/components/app-bar";
import { AppBarActions } from "@/components/app-bar-actions";
import { UsSurface } from "@/components/us-surface";

export default function UsPage() {
  return (
    <>
      <AppBar>
        <AppBarActions />
      </AppBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 p-4 pb-bottom-nav">
        <UsSurface />
      </main>
    </>
  );
}
