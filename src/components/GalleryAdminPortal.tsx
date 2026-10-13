import { useEffect, useRef, useState } from "react";
import { galleryService } from "../data/galleryService";
import { assetUrl } from "../lib/assets";
import { galleryDashboard, galleryRequest, GalleryServiceError, serviceAvailable } from "../lib/galleryService";

interface AdminSession { token: string; expiresAt: number; dashboardKey: string }
interface PanelAction { type: string; days?: number; album?: string; password?: string }

export function GalleryAdminPortal({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const session = useRef<AdminSession | undefined>(undefined);
  const port = useRef<MessagePort | undefined>(undefined);
  const abort = useRef(new AbortController());
  const refreshAbort = useRef<AbortController | undefined>(undefined);
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const controller = new AbortController();
    abort.current = controller;
    element?.showModal(); document.body.style.overflow = "hidden"; input.current?.focus();
    return () => {
      controller.abort(); refreshAbort.current?.abort(); port.current?.close(); element?.close(); document.body.style.overflow = overflow;
      if (session.current) void galleryRequest("/v1/admin/logout", {}, session.current.token).catch(() => {});
      session.current = undefined;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!html || !session.current) return;
    const timer = window.setTimeout(() => {
      session.current = undefined; port.current?.close(); setHtml(""); setError("管理会话已过期，请重新登录。");
    }, Math.max(0, session.current.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [html]);

  async function refresh(days = 30, album = "all") {
    if (!session.current) return;
    refreshAbort.current?.abort();
    const controller = new AbortController();
    refreshAbort.current = controller;
    try {
      const data = await galleryDashboard(days, album, session.current.token, controller.signal);
      if (controller.signal.aborted) return;
      port.current?.postMessage({ type: "data", data });
    } catch (failure) {
      if (abort.current.signal.aborted || controller.signal.aborted) return;
      if (failure instanceof GalleryServiceError && failure.status === 401) {
        session.current = undefined; port.current?.close(); setHtml(""); setError("管理会话已过期，请重新登录。");
      } else port.current?.postMessage({ type: "error", message: "记录暂时无法加载，请重试。" });
    }
  }
  function connectPanel() {
    port.current?.close();
    const channel = new MessageChannel(); port.current = channel.port1;
    channel.port1.onmessage = async ({ data }: MessageEvent<PanelAction>) => {
      if (!data || !session.current) return;
      if (data.type === "refresh") await refresh(data.days, data.album);
      else if (data.type === "logout") onClose();
      else if (data.type === "reset" && typeof data.password === "string") {
        try {
          await galleryRequest("/v1/admin/reset", { password: data.password }, session.current.token, abort.current.signal);
          data.password = "";
          channel.port1.postMessage({ type: "reset-complete" });
          await refresh();
        } catch (failure) {
          data.password = "";
          channel.port1.postMessage({ type: "error", message: failure instanceof GalleryServiceError && failure.status === 429 ? "重置尝试过于频繁，请稍后再试。" : "未能清除记录，请检查删除口令或重新登录。" });
        }
      }
    };
    iframe.current?.contentWindow?.postMessage({ type: "gallery-admin:init" }, "*", [channel.port2]);
  }

  return <dialog ref={dialog} className={`gallery-admin ${html ? "gallery-admin--open" : ""}`} aria-label="相册管理" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <button className="gallery-admin__close" onClick={onClose} aria-label="关闭管理窗口">×</button>
    {html ? <iframe ref={iframe} title="加密相册管理面板" sandbox="allow-scripts" srcDoc={html} onLoad={connectPanel} /> : <form className="gallery-admin__login" onSubmit={async (event) => {
      event.preventDefault(); if (busy || !input.current?.value) return;
      setBusy(true); setError("");
      try {
        const authenticated = await galleryRequest<AdminSession>("/v1/admin/session", { password: input.current.value }, undefined, abort.current.signal);
        input.current.value = ""; session.current = authenticated;
        const response = await fetch(assetUrl(galleryService.dashboardAsset), { signal: abort.current.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unavailable panel");
        const encrypted = await response.arrayBuffer();
        const rawKey = Uint8Array.from(atob(authenticated.dashboardKey), (value) => value.charCodeAt(0));
        const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]); rawKey.fill(0);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: encrypted.slice(0, 12), additionalData: new TextEncoder().encode("gallery-admin:v1") }, key, encrypted.slice(12));
        authenticated.dashboardKey = "";
        if (!abort.current.signal.aborted) setHtml(new TextDecoder().decode(plain));
      } catch (failure) {
        if (session.current) {
          void galleryRequest("/v1/admin/logout", {}, session.current.token).catch(() => {});
          session.current.dashboardKey = "";
          session.current = undefined;
        }
        if (abort.current.signal.aborted) return;
        if (input.current) input.current.value = "";
        setError(failure instanceof GalleryServiceError && failure.status === 429 ? "尝试过于频繁，请稍后再试。" : "无法打开管理面板，请检查口令和服务连接。");
      } finally { if (!abort.current.signal.aborted) setBusy(false); }
    }}>
      <span className="eyebrow">PRIVATE JOURNAL</span><h2>相册记录</h2><p>输入管理口令，查看加密的访问记录。</p>
      {!serviceAvailable() && <p role="status">管理服务尚未连接。需要先部署 Cloudflare 后端并设置服务地址。</p>}
      <label htmlFor="gallery-admin-password">管理口令</label>
      <div className="gallery-admin__password"><input ref={input} id="gallery-admin-password" type={revealed ? "text" : "password"} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={512} required /><button type="button" aria-label={revealed ? "隐藏管理口令" : "显示管理口令"} onClick={() => setRevealed((value) => !value)}>{revealed ? "隐藏" : "显示"}</button></div>
      {error && <p className="gallery-admin__error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={busy || !serviceAvailable()}>{busy ? "正在验证…" : "打开记录"}</button>
    </form>}
  </dialog>;
}
