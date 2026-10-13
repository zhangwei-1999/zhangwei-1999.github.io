import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../lib/assets";
import { decryptPhoto, type EncryptedPhoto } from "../lib/encryptedGallery";
import type { Language, Photo } from "../types";

interface GalleryImageProps {
  photo: Photo | EncryptedPhoto;
  language: Language;
  decryptionKey?: CryptoKey;
  kind?: "thumbnail" | "full";
  lazy?: boolean;
  decorative?: boolean;
  className?: string;
}

export function GalleryImage({ photo, language, decryptionKey, kind = "thumbnail", lazy = kind === "thumbnail", decorative = false, className }: GalleryImageProps) {
  if (!decryptionKey) return <img className={className} src={assetUrl(kind === "thumbnail" ? photo.thumbnail || photo.src : photo.src)} alt={decorative ? "" : photo.alt[language]} width={photo.width} height={photo.height} loading={lazy ? "lazy" : "eager"} decoding="async" />;
  return <DecryptedImage key={`${photo.id}:${kind}`} photo={photo as EncryptedPhoto} language={language} decryptionKey={decryptionKey} kind={kind} lazy={lazy} decorative={decorative} className={className} />;
}

function DecryptedImage({ photo, language, decryptionKey, kind, lazy, decorative, className }: GalleryImageProps & { photo: EncryptedPhoto; decryptionKey: CryptoKey }) {
  const placeholder = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    let started = false;
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const blob = await decryptPhoto(photo, decryptionKey, kind, controller.signal);
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: "240px" });
    if (!lazy) void load();
    else if (placeholder.current) observer.observe(placeholder.current);
    return () => {
      controller.abort();
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo, decryptionKey, kind, lazy]);
  if (src) return <img className={className} src={src} alt={decorative ? "" : photo.alt[language]} width={photo.width} height={photo.height} decoding="async" />;
  return <span ref={placeholder} className={`gallery-image-placeholder ${className ?? ""}`} style={{ aspectRatio: `${photo.width}/${photo.height}` }} role={decorative ? undefined : "status"} aria-hidden={decorative || undefined}>
    {failed ? (language === "zh" ? "照片暂时无法加载，请重新打开。" : "Photo unavailable. Please reopen it.") : (language === "zh" ? "正在显影…" : "A moment, coming into view…")}
  </span>;
}
