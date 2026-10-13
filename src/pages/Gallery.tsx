import { useEffect, useState } from "react";
import { AlbumCard } from "../components/AlbumCard";
import { Lightbox } from "../components/Lightbox";
import { AlbumCover } from "../components/AlbumCover";
import { GalleryAdminPortal } from "../components/GalleryAdminPortal";
import { recordAlbumVisit } from "../lib/galleryService";
import { GalleryCollection } from "../components/GalleryCollection";
import { GalleryUnlockDialog } from "../components/GalleryUnlockDialog";
import { Icon } from "../components/Icon";
import { gallery } from "../data/gallery";
import { assetUrl } from "../lib/assets";
import { Link, useRouter } from "../lib/router";
import { useGallerySession } from "../lib/gallerySession";
import { openPublicAlbum, type UnlockedAlbum } from "../lib/encryptedGallery";
import type { Album, Language } from "../types";

interface GalleryProps {
  slug?: string;
  language: Language;
}

export function Gallery({ slug, language }: GalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pendingAlbum, setPendingAlbum] = useState<Album | null>(null);
  const [publicSession, setPublicSession] = useState<UnlockedAlbum>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);
  const { albums, remember, lock } = useGallerySession();
  const { navigate } = useRouter();
  const zh = language === "zh";
  const album = slug ? gallery.find((item) => item.slug === slug) : undefined;
  const privateSession = album ? albums[album.slug] : undefined;
  const session = album?.private ? privateSession : publicSession;
  const photos = album?.private || album?.encrypted ? session?.photos ?? [] : album?.photos ?? [];
  const locked = Boolean(album?.private && !session);
  const count = album?.private?.photoCount ?? album?.encrypted?.photoCount ?? photos.length;
  const encrypted = album?.private ? undefined : album?.encrypted;
  const loading = Boolean(encrypted && !publicSession && !loadFailed);
  useEffect(() => { if (album) recordAlbumVisit(album.slug, language); }, [album, language]);
  useEffect(() => {
    if (!encrypted) return;
    const controller = new AbortController();
    void openPublicAlbum(assetUrl(encrypted.manifest), encrypted.viewKey, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setPublicSession(result); })
      .catch(() => { if (!controller.signal.aborted) setLoadFailed(true); });
    return () => controller.abort();
  }, [encrypted, retry]);
  const unlockDialog = pendingAlbum && <GalleryUnlockDialog album={pendingAlbum} language={language}
    onClose={() => setPendingAlbum(null)} onUnlocked={(unlocked) => {
      remember(pendingAlbum.slug, unlocked);
      setPendingAlbum(null);
      navigate(`/gallery/${pendingAlbum.slug}`);
    }} />;

  if (slug && !album) {
    return (
      <div className="gallery-page">
        <header className="page-heading">
          <p className="eyebrow">{zh ? "生活切片" : "BEYOND RESEARCH"}</p>
          <h1>{zh ? "未找到相册" : "Album not found"}</h1>
        </header>
        <p>{zh ? "这个相册暂时不存在。" : "This album is not available."}</p>
        <Link to="/gallery" className="gallery-back">
          ← {zh ? "返回相册" : "Back to gallery"}
        </Link>
      </div>
    );
  }

  if (album) {
    return (
      <div className="gallery-page gallery-detail">
        <Link to="/gallery" className="gallery-back">
          ← {zh ? "所有相册" : "All albums"}
        </Link>
        <header className="page-heading">
          <p className="eyebrow">{zh ? "生活切片" : "BEYOND RESEARCH"}</p>
          <h1>{album.title[language]}</h1>
          <p>{album.description[language]}</p>
          <span className="gallery-detail__count">
            {zh
              ? `${count} 张照片`
              : `${count} ${count === 1 ? "photograph" : "photographs"}`}
          </span>
          {privateSession && <button type="button" className="gallery-lock-button" onClick={() => { setSelectedIndex(null); lock(album.slug); }}><Icon name="lock" size={14} />{zh ? "锁定相册" : "Lock album"}</button>}
        </header>
        {locked ? (
          <section className="gallery-locked glass">
            {(album.cover || album.encryptedCover) && <div className="gallery-locked__cover"><AlbumCover album={album} language={language} /></div>}
            <div className="gallery-unlock__symbol"><Icon name="lock" size={25} /></div>
            <h2>{zh ? "一些瞬间，与你分享。" : "A few moments to share with you."}</h2>
            <p>{zh ? "解锁后，慢慢翻看这里的时光。" : "Unlock this collection to step inside."}</p>
            <button type="button" className="button button-primary" onClick={() => setPendingAlbum(album)}>{zh ? "解锁相册" : "Unlock album"}</button>
          </section>
        ) : loading ? (
          <div className="gallery-loading glass" role="status"><span className="gallery-loading__mark" aria-hidden="true">✧</span><p>{zh ? "照片正在慢慢显影…" : "A few moments, coming into view…"}</p></div>
        ) : loadFailed ? (
          <div className="gallery-loading glass" role="alert"><p>{zh ? "相册暂时未能打开，请稍后再试。" : "This collection could not be opened. Please try again."}</p><button type="button" className="button button-primary" onClick={() => { setLoadFailed(false); setRetry((value) => value + 1); }}>{zh ? "重新打开" : "Try again"}</button></div>
        ) : photos.length ? (
          <GalleryCollection album={album} photos={photos} language={language} decryptionKey={session?.key} onOpen={setSelectedIndex} />
        ) : (
          <div className="gallery-empty glass">
            <div className="gallery-empty__illustration" aria-hidden="true">
              <span />
              <span />
            </div>
            <p className="eyebrow">
              {zh ? "让时光慢一点" : "ROOM FOR THE LITTLE THINGS"}
            </p>
            <h2>
              {zh
                ? "一些瞬间，尚待珍藏。"
                : "A few moments, yet to be collected."}
            </h2>
            <p>
              {zh
                ? "这里还没有照片。未来的日常、光影与故事，将慢慢填满这片留白。"
                : "No photographs here just yet. A little space for everyday moments, light, and stories to find their way in."}
            </p>
            <Link to="/gallery" className="gallery-back">
              ← {zh ? "浏览其他相册" : "Browse other albums"}
            </Link>
          </div>
        )}
        {selectedIndex !== null && photos.length > 0 && !locked && (
          <Lightbox
            photos={photos}
            decryptionKey={session?.key}
            initialIndex={selectedIndex}
            language={language}
            onClose={() => setSelectedIndex(null)}
          />
        )}
        {unlockDialog}
      </div>
    );
  }

  return (
    <div className="gallery-page">
      <header className="page-heading gallery-heading">
        <p className="eyebrow">{zh ? "生活切片" : "BEYOND RESEARCH"}</p>
        <h1>{zh ? "一些我不想忘记的瞬间" : "Moments I want to remember"}</h1>
        <p>
          {zh
            ? "当下或永久"
            : "moment or forever"}
        </p>
        <p className="gallery-summary">{zh
          ? `${gallery.length} 个相册 · ${gallery.reduce((sum, item) => sum + (item.private?.photoCount ?? item.encrypted?.photoCount ?? item.photos.length), 0)} 张照片`
          : `${gallery.length} albums · ${gallery.reduce((sum, item) => sum + (item.private?.photoCount ?? item.encrypted?.photoCount ?? item.photos.length), 0)} photographs`}</p>
      </header>
      <div className="gallery-albums">
        {gallery.map((item, index) => (
          <AlbumCard
            key={item.slug}
            album={item}
            language={language}
            index={index}
            unlocked={Boolean(albums[item.slug])}
            onRequestUnlock={() => { recordAlbumVisit(item.slug, language); setPendingAlbum(item); }}
          />
        ))}
      </div>
      <p className="gallery-note">
        {zh ? <>珍藏日常，不急不缓<a href="#private-journal" className="gallery-note__entry" aria-label="打开相册管理" onClick={(event) => { event.preventDefault(); setAdminOpen(true); }}>。</a></> : "Small moments. Slowly collected."}
      </p>
      {unlockDialog}
      {adminOpen && <GalleryAdminPortal onClose={() => setAdminOpen(false)} />}
    </div>
  );
}
