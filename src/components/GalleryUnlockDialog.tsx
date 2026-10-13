import { useEffect, useId, useRef, useState } from "react";
import { assetUrl } from "../lib/assets";
import { GalleryUnlockError, openManagedAlbum, unlockAlbum, type UnlockedAlbum } from "../lib/encryptedGallery";
import { galleryRequest, GalleryServiceError, visitContext, type UnlockStatus } from "../lib/galleryService";
import type { Album, Language } from "../types";
import { Icon } from "./Icon";

interface GalleryUnlockDialogProps {
  album: Album;
  language: Language;
  onClose: () => void;
  onUnlocked: (session: UnlockedAlbum) => void;
}

export function GalleryUnlockDialog({ album, language, onClose, onUnlocked }: GalleryUnlockDialogProps) {
  const zh = language === "zh";
  const titleId = useId();
  const hintId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"password" | "load" | null>(null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const managed = album.private?.access === "managed";
  const [checking, setChecking] = useState(Boolean(managed));
  const remaining = Math.max(0, Math.ceil((blockedUntil - now) / 1000));

  useEffect(() => {
    if (!managed) return;
    const controller = new AbortController();
    void galleryRequest<UnlockStatus>(`/v1/albums/${album.slug}/status`, undefined, undefined, controller.signal)
      .then((status) => { setBlockedUntil(status.blockedUntil || 0); setNow(Date.now()); })
      .catch(() => { if (!controller.signal.aborted) setError("load"); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [managed, album.slug]);
  useEffect(() => {
    if (!blockedUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      controllerRef.current?.abort();
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="gallery-unlock" aria-labelledby={titleId} aria-describedby={hintId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="gallery-unlock__panel">
        <button type="button" className="gallery-unlock__close" onClick={onClose} aria-label={zh ? "关闭解锁窗口" : "Close unlock dialog"}><Icon name="close" /></button>
        <div className="gallery-unlock__symbol"><Icon name="lock" size={25} /></div>
        <p className="eyebrow">{zh ? "珍藏时光" : "A PRIVATE COLLECTION"}</p>
        <h2 id={titleId}>{zh ? `解锁${album.title.zh}` : `Unlock ${album.title.en}`}</h2>
        <p id={hintId} className="gallery-unlock__hint">{album.private?.hint[language]}</p>
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (busy || checking || remaining || !album.private || !inputRef.current?.value) return;
          const controller = new AbortController();
          controllerRef.current = controller;
          setBusy(true);
          setError(null);
          try {
            const password = inputRef.current.value;
            const session = managed
              ? await (async () => {
                  const response = await galleryRequest<{ viewKey: string }>(`/v1/albums/${album.slug}/unlock`, { password, ...visitContext(language) }, undefined, controller.signal);
                  return openManagedAlbum(assetUrl(album.private!.manifest), response.viewKey, controller.signal);
                })()
              : await unlockAlbum(assetUrl(album.private.manifest), password, controller.signal);
            if (!controller.signal.aborted) {
              if (inputRef.current) inputRef.current.value = "";
              onUnlocked(session);
            }
          } catch (failure) {
            if (controller.signal.aborted) return;
            if (failure instanceof GalleryServiceError && failure.blockedUntil > Date.now()) { setBlockedUntil(failure.blockedUntil); setNow(Date.now()); }
            setError(failure instanceof GalleryUnlockError || (failure instanceof GalleryServiceError && [401, 429].includes(failure.status)) ? "password" : "load");
            if (inputRef.current) { inputRef.current.value = ""; inputRef.current.focus(); }
          } finally {
            if (!controller.signal.aborted) setBusy(false);
          }
        }}>
          <label htmlFor={inputId}>{zh ? "密码" : "Password"}</label>
          <input ref={inputRef} id={inputId} name="album-password" type="text" required maxLength={512} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby={hintId} readOnly={busy || remaining > 0} />
          {managed && <p className="gallery-security-note">{zh ? "请输入" : "Input"}</p>}
          {remaining > 0 && <p className="gallery-cooldown" role="status">{zh ? "尝试次数较多，请等待 " : "Please wait "}{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}{zh ? " 后重试。" : " before trying again."}</p>}
          {error && <p className="gallery-unlock__error" role="alert">{error === "password"
            ? (zh ? "密码不正确，或相册无法验证。请再试一次。" : "The password is incorrect, or the album could not be verified. Please try again.")
            : (zh ? "暂时无法加载相册，请检查网络后重试。" : "The album could not be loaded. Check your connection and try again.")}</p>}
          <button className="button button-primary" type="submit" disabled={busy || checking || remaining > 0}>{checking ? (zh ? "正在检查…" : "Checking…") : busy ? (zh ? "正在解锁…" : "Unlocking…") : (zh ? "解锁相册" : "Unlock album")}</button>
          <span className="gallery-unlock__status" role="status">{busy ? (managed ? (zh ? "正在验证并解密" : "Verifying and decrypting") : (zh ? "正在本机解密" : "Decrypting on this device")) : ""}</span>
        </form>
      </div>
    </dialog>
  );
}
