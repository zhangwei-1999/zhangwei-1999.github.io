import { Link } from "../lib/router";
import type { Album, Language } from "../types";
import { Icon } from "./Icon";
import { AlbumCover } from "./AlbumCover";

interface AlbumCardProps {
  album: Album;
  language: Language;
  index: number;
  unlocked?: boolean;
  onRequestUnlock?: () => void;
}

export function AlbumCard({ album, language, index, unlocked, onRequestUnlock }: AlbumCardProps) {
  const count = album.private?.photoCount ?? album.encrypted?.photoCount ?? album.photos.length;
  const locked = Boolean(album.private && !unlocked);
  const countLabel =
    language === "zh"
      ? `${count} 张照片`
      : `${count} ${count === 1 ? "photo" : "photos"}`;

  return (
    <Link
      to={`/gallery/${album.slug}`}
      className={`album-card ripple-surface album-card--${index % 3}${album.layout === "wide" ? " album-card--wide" : ""}`}
      aria-haspopup={locked ? "dialog" : undefined}
      onClick={(event) => {
        if (locked && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onRequestUnlock?.(); }
      }}
    >
      <div className="album-card__visual">
        <div className="album-art" aria-hidden="true">
            <div className="album-art__sun" />
            <div className="album-art__arch" />
            <div className="album-art__horizon" />
            <span className="album-art__number">0{index + 1}</span>
        </div>
        <AlbumCover album={album} language={language} />
        <div className="album-card__overlay" aria-hidden="true" />
        <span className="album-card__count">{countLabel}</span>
        {album.private && <span className="album-card__privacy"><Icon name="lock" size={14} />{locked ? (language === "zh" ? "已上锁" : "Locked") : (language === "zh" ? "已解锁" : "Unlocked")}</span>}
        <div className="album-card__content">
          {!count && (
            <span className="album-card__empty">
              {language === "zh" ? "留待记录" : "A collection to come"}
            </span>
          )}
          <h2>{album.title[language]}</h2>
          <p>{album.description[language]}</p>
          <span className="album-card__explore">
            {language === "zh" ? "打开相册" : "Explore album"}{" "}
            <span aria-hidden="true">↗</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
