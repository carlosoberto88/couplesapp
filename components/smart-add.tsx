"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Candidate = {
  id: string;
  name: string;
  note: string;
  checked: boolean;
};

type SmartAddProps = {
  listId: string;
  onAddBulk: (items: { name: string; note: string | null }[]) => void;
  variant?: "icon" | "menu";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

type Stage = "compose" | "review";

export function SmartAdd({
  listId,
  onAddBulk,
  variant = "icon",
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
}: SmartAddProps) {
  const t = useTranslations("smartAdd");
  const tItems = useTranslations("items");
  const tCommon = useTranslations("common");

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [stage, setStage] = useState<Stage>("compose");
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  function reset() {
    setStage("compose");
    setText("");
    setParsing(false);
    setError(null);
    setCandidates([]);
  }

  function handleOpenChange(next: boolean) {
    (controlledOnOpenChange ?? setInternalOpen)(next);
    if (!next) reset();
  }

  async function handleParse() {
    const trimmed = text.trim();
    if (!trimmed || parsing) return;

    setParsing(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId, text: trimmed }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setError(data?.error ?? t("parseError"));
        setParsing(false);
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      setCandidates(
        items.map((item: { name: string; note?: string }) => ({
          id: crypto.randomUUID(),
          name: item.name,
          note: item.note ?? "",
          checked: true,
        })),
      );
      setStage("review");
      setParsing(false);
    } catch {
      setError(t("parseError"));
      setParsing(false);
    }
  }

  function toggleCandidate(id: string) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)));
  }

  function updateCandidateName(id: string, name: string) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  function updateCandidateNote(id: string, note: string) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, note } : c)));
  }

  const checkedCandidates = candidates.filter((c) => c.checked && c.name.trim().length > 0);

  function handleAddChecked() {
    const toAdd = checkedCandidates;
    if (toAdd.length === 0) return;

    onAddBulk(
      toAdd.map((candidate) => ({
        name: candidate.name.trim(),
        note: candidate.note.trim().length > 0 ? candidate.note.trim() : null,
      })),
    );

    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger ? (
        <DialogTrigger
          render={
            variant === "menu" ? (
              <Button type="button" variant="secondary" size="sm" className="rounded-full">
                <Sparkles className="size-4" />
                {t("menuLabel")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="icon-lg"
                className="h-11 w-11 shrink-0 rounded-full bg-duo-coral-tint text-duo-coral hover:bg-duo-coral-tint/70"
                aria-label={t("triggerLabel")}
              >
                <Sparkles />
              </Button>
            )
          }
        />
      ) : null}

      <DialogContent keyboardAware className="flex flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {stage === "compose" ? t("composeDescription") : t("reviewDescription")}
          </DialogDescription>
        </DialogHeader>

        <div
          data-dialog-scroll-body
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
        {stage === "compose" ? (
          <div className="flex flex-col gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={parsing}
              placeholder={t("pastePlaceholder")}
              rows={6}
              autoFocus
              className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />

            {error && (
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-duo-coral-tint px-3 py-2.5 text-sm text-foreground">
                <span>{error}</span>
                <Button type="button" variant="secondary" size="sm" onClick={handleParse}>
                  {tCommon("retry")}
                </Button>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                onClick={handleParse}
                disabled={parsing || text.trim().length === 0}
                className="bg-duo-teal text-white hover:bg-duo-teal/90"
              >
                {parsing && <Loader2 className="animate-spin" />}
                {t("parse")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {candidates.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {t("emptyResults")}
              </p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                {candidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className={cn(
                      "flex items-start gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 transition-opacity",
                      !candidate.checked && "opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCandidate(candidate.id)}
                      aria-label={
                        candidate.checked
                          ? t("excludeItem", { name: candidate.name })
                          : t("includeItem", { name: candidate.name })
                      }
                      aria-pressed={candidate.checked}
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        candidate.checked ? "border-transparent bg-duo-teal text-white" : "border-input",
                      )}
                    >
                      {candidate.checked && <Check className="size-3" />}
                    </button>

                    <div className="flex flex-1 flex-col gap-1">
                      <Input
                        value={candidate.name}
                        onChange={(e) => updateCandidateName(candidate.id, e.target.value)}
                        placeholder={t("itemNamePlaceholder")}
                        className="h-8 border-none bg-transparent px-0 text-sm focus-visible:ring-0"
                      />
                      <Input
                        value={candidate.note}
                        onChange={(e) => updateCandidateNote(candidate.id, e.target.value)}
                        placeholder={tItems("addNotePlaceholder")}
                        className="h-6 border-none bg-transparent px-0 text-xs text-muted-foreground focus-visible:ring-0"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStage("compose")}>
                {t("back")}
              </Button>
              <Button
                type="button"
                onClick={handleAddChecked}
                disabled={checkedCandidates.length === 0}
                className="bg-duo-teal text-white hover:bg-duo-teal/90"
              >
                {t("addItems", { count: checkedCandidates.length })}
              </Button>
            </DialogFooter>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
