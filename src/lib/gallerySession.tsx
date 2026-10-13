import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { UnlockedAlbum } from "./encryptedGallery";
import { useRouter } from "./router";

const GallerySessionContext = createContext<{
  albums: Record<string, UnlockedAlbum>;
  remember: (slug: string, album: UnlockedAlbum) => void;
  lock: (slug: string) => void;
}>({ albums: {}, remember: () => {}, lock: () => {} });

/** Keys live only in this tab's memory. Reloading discards every session. */
export function GallerySessionProvider({ children }: { children: ReactNode }) {
  const [albums, setAlbums] = useState<Record<string, UnlockedAlbum>>({});
  const { path } = useRouter();
  const previousPath = useRef(path);
  useEffect(() => {
    const previousAlbum = /^\/gallery\/([^/]+)$/.exec(previousPath.current)?.[1];
    if (previousAlbum && path !== previousPath.current) setAlbums((current) => {
      const next = { ...current };
      delete next[previousAlbum];
      return next;
    });
    previousPath.current = path;
  }, [path]);
  return (
    <GallerySessionContext.Provider value={{
      albums,
      remember: (slug, album) => setAlbums((current) => ({ ...current, [slug]: album })),
      lock: (slug) => setAlbums((current) => {
        const next = { ...current };
        delete next[slug];
        return next;
      }),
    }}>
      {children}
    </GallerySessionContext.Provider>
  );
}

export function useGallerySession() {
  return useContext(GallerySessionContext);
}
