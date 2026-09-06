import React, { type ImgHTMLAttributes, type ReactNode } from "react";
import { resolveDeckCardArtwork } from "./cardArtwork";

export function CardArtworkImage({ card, fallback, ...imageProps }: {
  card: Parameters<typeof resolveDeckCardArtwork>[0];
  fallback: ReactNode;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const imageUrl = resolveDeckCardArtwork(card);
  return imageUrl ? <img {...imageProps} src={imageUrl} /> : fallback;
}
