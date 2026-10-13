import { useState, type CSSProperties, type ReactNode } from "react";
import type { EncryptedPhoto } from "../lib/encryptedGallery";
import type { Album, Language, Photo } from "../types";
import { GalleryImage } from "./GalleryImage";
import { PhotoRail } from "./PhotoRail";

type GalleryPhoto = Photo | EncryptedPhoto;
interface CollectionProps {
  album: Album;
  photos: GalleryPhoto[];
  language: Language;
  decryptionKey?: CryptoKey;
  onOpen: (index: number) => void;
}

function PhotoFrame({ photo, language, decryptionKey, onOpen, full = false, className = "" }: {
  photo: GalleryPhoto; language: Language; decryptionKey?: CryptoKey; onOpen: () => void; full?: boolean; className?: string;
}) {
  return <figure className={`collection-photo ${className}`} style={{ "--photo-aspect": photo.width / photo.height } as CSSProperties}>
    <button type="button" className="collection-photo__button ripple-surface" onClick={onOpen} aria-label={`${language === "zh" ? "打开照片：" : "Open photo: "}${photo.alt[language]}`} aria-haspopup="dialog">
      <GalleryImage photo={photo} language={language} decryptionKey={decryptionKey} kind={full ? "full" : "thumbnail"} lazy />
      <span className="collection-photo__expand" aria-hidden="true">↗</span>
    </button>
    {photo.caption && <figcaption>{photo.caption[language]}</figcaption>}
  </figure>;
}

function BirthdayChapters({ photos, language, renderPhoto }: { photos: GalleryPhoto[]; language: Language; renderPhoto: (photo: GalleryPhoto, full?: boolean) => ReactNode }) {
  const zh = language === "zh";
  const years = [...new Set(photos.map((photo) => photo.year ?? (photo.date ? Number(photo.date.slice(0, 4)) : undefined)))].sort((a, b) => (b ?? 0) - (a ?? 0));
  return <section className="birthday-chapters" id="birthdays" aria-labelledby="birthday-heading">
    <div className="birthday-chapters__light" aria-hidden="true" />
    <header className="birthday-chapters__heading">
      <span className="birthday-chapters__spark" aria-hidden="true">✧</span>
      <p className="eyebrow">{zh ? "岁岁，常新" : "A LITTLE MORE LIGHT, EACH YEAR"}</p>
      <h2 id="birthday-heading">{zh ? "生日，岁岁如光。" : "Birthday chapters."}</h2>
      <span className="birthday-chapters__rule" aria-hidden="true" />
    </header>
    {years.map((year) => <section className="birthday-year" key={year ?? "undated"} aria-label={year ? String(year) : (zh ? "生日照片" : "Birthday photographs")}>
      <div className="birthday-year__label">{year && <h3>{year}</h3>}<span>{zh ? "生日留影" : "A birthday, kept close"}</span><span aria-hidden="true">✦</span></div>
      <div className="birthday-year__photos">{photos.filter((photo) => (photo.year ?? (photo.date ? Number(photo.date.slice(0, 4)) : undefined)) === year).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((photo) => renderPhoto(photo, true))}</div>
    </section>)}
  </section>;
}

export function GalleryCollection({ album, photos, language, decryptionKey, onOpen }: CollectionProps) {
  const [year, setYear] = useState("all");
  const zh = language === "zh";
  const renderPhoto = (photo: GalleryPhoto, full = false) => <PhotoFrame key={photo.id} photo={photo} language={language} decryptionKey={decryptionKey} full={full} onOpen={() => onOpen(photos.indexOf(photo))} />;

  if (album.presentation === "timeline") {
    const birthdays = photos.filter((photo) => photo.section === "birthdays");
    const moments = photos.filter((photo) => photo.section !== "birthdays");
    const dates = [...new Set(moments.map((photo) => photo.date || "undated"))].sort((a, b) => a === "undated" ? 1 : b === "undated" ? -1 : b.localeCompare(a));
    const years = [...new Set(dates.filter((date) => date !== "undated").map((date) => date.slice(0, 4)))];
    return <div className="life-collection">
      <div className="life-controls"><div className="life-year-filter" role="group" aria-label={zh ? "按年份浏览生活照片" : "Browse life photographs by year"}>
        {["all", ...years].map((value) => <button key={value} type="button" aria-pressed={year === value} onClick={() => setYear(value)}>{value === "all" ? (zh ? "所有年份" : "All years") : value}</button>)}
      </div>{birthdays.length > 0 && <a className="birthday-jump" href="#birthdays">{zh ? "生日篇章" : "Birthday chapters"}<span aria-hidden="true">↓</span></a>}</div>
      <div className="life-timeline">
        {dates.filter((date) => year === "all" || date.startsWith(year)).map((date) => {
          const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
          const label = valid ? new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : (zh ? "未注明日期" : "Undated moments");
          const items = moments.filter((photo) => (photo.date || "undated") === date).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
          return <section className="life-entry" key={date} aria-label={label}>
            <header className="life-entry__date">
              {valid ? <time dateTime={date}><span>{date.slice(0, 4)}</span><strong>{zh ? `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日` : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</strong></time> : <strong>{label}</strong>}
              <span className="life-entry__count">{items.length} {zh ? "张照片" : items.length === 1 ? "moment" : "moments"}</span>
            </header>
            <PhotoRail label={label} language={language}>{items.map((photo) => renderPhoto(photo))}</PhotoRail>
          </section>;
        })}
      </div>
      {birthdays.length > 0 && <BirthdayChapters photos={birthdays} language={language} renderPhoto={renderPhoto} />}
    </div>;
  }

  if (album.sections?.length) {
    const assigned = new Set(album.sections.map((section) => section.id));
    const remaining = photos.filter((photo) => !photo.section || !assigned.has(photo.section));
    return <div className="curated-collection">
      {album.sections.map((section, index) => {
        const items = photos.filter((photo) => photo.section === section.id).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
        if (!items.length) return null;
        const layout = section.layout || "grid";
        return <section className={`curated-section curated-section--${layout}`} key={section.id} aria-labelledby={`section-${section.id}`}>
          <header className="gallery-section-heading"><span className="gallery-section-heading__index">{String(index + 1).padStart(2, "0")}</span><div><h2 id={`section-${section.id}`}>{section.title[language]}</h2>{section.description && <p>{section.description[language]}</p>}</div><span className="gallery-section-heading__count">{items.length.toString().padStart(2, "0")}</span></header>
          <div className={`curated-photos curated-photos--${layout}`}>
            {items.map((photo) => layout === "artwork" ? <div className="artwork-print" key={photo.id}><span className="artwork-print__sequence">{String(photo.sequence ?? items.indexOf(photo) + 1).padStart(2, "0")}</span>{renderPhoto(photo, true)}</div> : renderPhoto(photo, layout === "concert" || layout === "birthday"))}
          </div>
        </section>;
      })}
      {remaining.length > 0 && <div className="curated-photos curated-photos--grid">{remaining.map((photo) => renderPhoto(photo))}</div>}
    </div>;
  }

  return <div className="curated-photos curated-photos--grid">{photos.map((photo) => renderPhoto(photo))}</div>;
}
