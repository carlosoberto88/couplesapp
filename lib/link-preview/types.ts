export type LinkPreviewSource = "cache" | "og" | "microlink" | "ai";

export type LinkPreviewResult = {
  normalizedUrl: string;
  name: string;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  imageStoragePath?: string | null;
  source: LinkPreviewSource;
  htmlSnippet?: string;
};

export type DownloadedImage = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
};

export type PreviewTokenPayload = {
  normalizedUrl: string;
  name: string;
  price: number | null;
  currency: string | null;
  imageStoragePath: string | null;
  source: LinkPreviewSource;
  exp: number;
};
