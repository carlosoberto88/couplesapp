import { AppBar } from "@/components/app-bar";
import { AppBarActions } from "@/components/app-bar-actions";
import { UsSurface } from "@/components/us-surface";
import { UsHomeSections } from "@/components/us-home-sections";
import { HomeRefreshOnFocus } from "@/components/home-refresh-on-focus";

export default function UsPage() {
  return (
    <>
      <HomeRefreshOnFocus />
      <AppBar>
        <AppBarActions />
      </AppBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 p-4 pb-bottom-nav">
        <UsSurface />
        <UsHomeSections />
      </main>
    </>
  );
}
