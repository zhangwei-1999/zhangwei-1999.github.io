import { useCallback, useEffect, useRef, useState } from "react";
import { GalleryImage } from "./GalleryImage";
import type { EncryptedPhoto } from "../lib/encryptedGallery";
import type { Language, Photo } from "../types";

interface LightboxProps {
  photos: (Photo | EncryptedPhoto)[];
  decryptionKey?: CryptoKey;
  initialIndex: number;
  language: Language;
  onClose: () => void;
}

export function Lightbox({
  photos,
  initialIndex,
  language,
  onClose,
  decryptionKey,
}: LightboxProps) {
  const [index, setIndex] = useState(
    Math.max(0, Math.min(initialIndex, photos.length - 1)),
  );
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const photo = photos[index];
  const zh = language === "zh";

  const requestClose = useCallback(() => {
    if (closeTimer.current !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (!dialog) return;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  const move = (direction: number) => {
    if (photos.length > 1)
      setIndex(
        (current) => (current + direction + photos.length) % photos.length,
      );
  };

  if (!photo) return null;

  return (
    <dialog
      ref={dialogRef}
      className={`gallery-lightbox${closing ? " gallery-lightbox--closing" : ""}`}
      aria-label={zh ? "照片浏览器" : "Photo viewer"}
      aria-describedby="lightbox-caption"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const current = controls.findIndex(
            (control) => control === document.activeElement,
          );
          const next =
            current < 0
              ? event.shiftKey
                ? controls.length - 1
                : 0
              : (current + (event.shiftKey ? -1 : 1) + controls.length) %
                controls.length;
          event.preventDefault();
          controls[next]?.focus({ preventScroll: true });
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
        if (event.key === "Home") {
          event.preventDefault();
          setIndex(0);
        }
        if (event.key === "End") {
          event.preventDefault();
          setIndex(photos.length - 1);
        }
      }}
    >
      <div className="gallery-lightbox__toolbar">
        <span
          className="gallery-lightbox__counter"
          aria-live="polite"
          aria-atomic="true"
        >
          {String(index + 1).padStart(2, "0")} <span aria-hidden="true">/</span>
          <span className="sr-only">{zh ? "，共" : " of "}</span>{" "}
          {String(photos.length).padStart(2, "0")}
        </span>
        <button
          ref={closeRef}
          type="button"
          className="gallery-lightbox__button"
          onClick={requestClose}
          aria-label={zh ? "关闭照片浏览器" : "Close photo viewer"}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div
        className="gallery-lightbox__stage"
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (touch)
            touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const touch = event.changedTouches[0];
          touchStart.current = null;
          if (!start || !touch) return;
          const x = touch.clientX - start.x;
          const y = touch.clientY - start.y;
          if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y) * 1.5)
            move(x < 0 ? 1 : -1);
        }}
      >
        <button
          type="button"
          className="gallery-lightbox__button gallery-lightbox__previous"
          onClick={() => move(-1)}
          disabled={photos.length < 2}
          aria-label={zh ? "上一张照片" : "Previous photo"}
        >
          <span aria-hidden="true">←</span>
        </button>
        <GalleryImage
          key={photo.id}
          className="gallery-lightbox__image"
          photo={photo}
          language={language}
          kind="full"
          decryptionKey={decryptionKey}
        />
        <button
          type="button"
          className="gallery-lightbox__button gallery-lightbox__next"
          onClick={() => move(1)}
          disabled={photos.length < 2}
          aria-label={zh ? "下一张照片" : "Next photo"}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <div
        className="gallery-lightbox__caption"
        id="lightbox-caption"
        aria-live="polite"
      >
        <p>{photo.caption?.[language] || photo.alt[language]}</p>
        <span>
          {zh
            ? "方向键浏览 · Esc 关闭"
            : "Arrow keys to explore · Esc to close"}
        </span>
      </div>
    </dialog>
  );
}
