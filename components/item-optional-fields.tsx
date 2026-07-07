"use client";

import { useRef, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2 } from "lucide-react";

import { MAX_IMAGES_PER_ITEM, validateImageFile } from "@/lib/upload-item-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type OptionalFieldKey = "url" | "note" | "photo";

type ItemOptionalFieldsProps = {
  url: string;
  note: string;
  files: File[];
  fileError: string | null;
  pending?: boolean;
  compact?: boolean;
  visibleFields?: OptionalFieldKey[];
  fileInputRef?: RefObject<HTMLInputElement | null>;
  /** Fired on paste and on blur so the parent can auto-enrich http(s) URLs. */
  onUrlCommit?: (url: string) => void;
  urlEnriching?: boolean;
  urlEnrichFailed?: boolean;
  onUrlChange: (url: string) => void;
  onNoteChange: (note: string) => void;
  onFilesChange: (files: File[]) => void;
  onFileErrorChange: (error: string | null) => void;
  className?: string;
};

export function ItemOptionalFields({
  url,
  note,
  files,
  fileError,
  pending = false,
  compact = false,
  visibleFields,
  fileInputRef: externalFileInputRef,
  onUrlCommit,
  urlEnriching = false,
  urlEnrichFailed = false,
  onUrlChange,
  onNoteChange,
  onFilesChange,
  onFileErrorChange,
  className,
}: ItemOptionalFieldsProps) {
  const tItems = useTranslations("items");
  const internalFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = externalFileInputRef ?? internalFileInputRef;

  const showUrl = !visibleFields || visibleFields.includes("url");
  const showNote = !visibleFields || visibleFields.includes("note");
  const showPhoto = !visibleFields || visibleFields.includes("photo");

  function handleFilesSelected(selected: FileList | null) {
    if (!selected?.length) return;
    onFileErrorChange(null);
    const next: File[] = [];
    for (const file of Array.from(selected)) {
      if (files.length + next.length >= MAX_IMAGES_PER_ITEM) break;
      const err = validateImageFile(file);
      if (err) {
        onFileErrorChange(err);
        continue;
      }
      next.push(file);
    }
    onFilesChange([...files, ...next].slice(0, MAX_IMAGES_PER_ITEM));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {showUrl ? (
        <div className="flex flex-col gap-1">
          <Input
            className={cn("rounded-xl", compact ? "h-10" : "h-11")}
            type="url"
            placeholder={tItems("urlPlaceholder")}
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (pasted.trim()) onUrlCommit?.(pasted);
            }}
            onBlur={(e) => onUrlCommit?.(e.target.value)}
            disabled={pending}
          />
          {urlEnriching ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {tItems("enrichingLink")}
            </p>
          ) : urlEnrichFailed ? (
            <p className="text-xs text-muted-foreground">{tItems("enrichFailed")}</p>
          ) : null}
        </div>
      ) : null}
      {showNote ? (
        <textarea
          className={cn(
            "w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "min-h-16" : "min-h-20",
          )}
          placeholder={tItems("descriptionPlaceholder")}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          disabled={pending}
        />
      ) : null}

      {showPhoto ? (
        <div className="flex flex-col gap-1.5">
          {!compact ? <Label>{tItems("photosLabel")}</Label> : null}
          {!compact && (
            <p className="text-xs text-muted-foreground">
              {tItems("photosHint", { max: MAX_IMAGES_PER_ITEM, sizeMb: 5 })}
            </p>
          )}
          {!externalFileInputRef ? (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
          ) : null}
          {!compact ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-fit rounded-xl"
              disabled={pending || files.length >= MAX_IMAGES_PER_ITEM}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="size-4" aria-hidden />
              {tItems("addPhotos")}
            </Button>
          ) : null}
          {fileError && (
            <p className="text-xs text-destructive">
              {fileError === "invalidType" ? tItems("imageInvalidType") : tItems("imageTooLarge")}
            </p>
          )}
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(file)}
                    alt=""
                    className={cn("rounded-lg object-cover", compact ? "size-14" : "size-16")}
                  />
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white"
                    onClick={() => onFilesChange(files.filter((_, i) => i !== index))}
                    aria-label={tItems("removePhoto")}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
