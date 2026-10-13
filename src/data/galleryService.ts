/** Public service address only. Credentials and encryption keys never belong here. */
export const galleryService = {
  apiUrl: (import.meta.env?.VITE_GALLERY_API_URL || "").replace(/\/$/, ""),
  dashboardAsset: "_data/panel.enc",
  cooldownMinutes: [1, 5, 10, 20, 30, 60],
  unrestrictedFailures: 5,
};
