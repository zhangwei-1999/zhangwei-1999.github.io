import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../lib/assets";
import { openPublicAlbum, type UnlockedAlbum } from "../lib/encryptedGallery";
import type { Album, Language } from "../types";
import { GalleryImage } from "./GalleryImage";

/** Only the independently published cover key is used here, never a private album key. */
export function AlbumCover({ album, language }: { album: Album; language: Language }) {
  const element = useRef<HTMLSpanElement>(null);
  const [collection, setCollection] = useState<UnlockedAlbum>();
  const encrypted = album.encryptedCover;
  const plain = album.cover || (!album.private && !album.encrypted ? album.photos[0]?.thumbnail || album.photos[0]?.src : undefined);

  useEffect(() => {
    if (!encrypted) return;
    const controller = new AbortController();
    let started = false;
    const observer = new IntersectionObserver((entries) => {
      if (started || !entries.some((entry) => entry.isIntersecting)) return;
      started = true;
      observer.disconnect();
      void openPublicAlbum(assetUrl(encrypted.manifest), encrypted.viewKey, controller.signal)
        .then((result) => { if (!controller.signal.aborted) setCollection(result); })
        .catch(() => { /* The abstract artwork remains a quiet fallback. */ });
    }, { rootMargin: "160px" });
    if (element.current) observer.observe(element.current);
    return () => { controller.abort(); observer.disconnect(); };
  }, [encrypted]);

  const photo = collection?.photos.find((item) => item.id === encrypted?.photoId);
  if (!encrypted && !plain) return null;
  return <span className="album-cover" ref={element} aria-hidden="true">
    {photo && collection ? <GalleryImage photo={photo} language={language} decryptionKey={collection.key} kind="thumbnail" lazy decorative />
      : plain ? <img src={assetUrl(plain)} alt="" width="800" height="1000" loading="lazy" decoding="async" /> : null}
  </span>;
}
