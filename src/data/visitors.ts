// Preserve the existing counter and its history from legacy/pre-redesign.html.
// This is a public widget ID, not an account password or API secret.
export const visitors = {
  enabled: true,
  provider: "MapMyVisitors",
  providerUrl: "https://mapmyvisitors.com/",
  // Existing profile URL returned by the original provider's widget response.
  statisticsUrl: "https://mapmyvisitors.com/web/1c1y2",
  widgetId: "86XgUPWCNrbBos3YqfbgpvhEB-Q5701-DCyYYhIKswg",
  colors: {
    land: "c4d7e0",
    // The local frame removes white from the map background only, leaving
    // transparent ocean and untouched visitor dots, controls and counter text.
    ocean: "ffffff",
    previousVisitors: "998caf",
    recentVisitors: "598c9e",
    text: "58717f",
  },
};

export function visitorWidgetUrl() {
  const parameters = new URLSearchParams({
    cl: visitors.colors.land,
    co: visitors.colors.ocean,
    cmo: visitors.colors.previousVisitors,
    cmn: visitors.colors.recentVisitors,
    ct: visitors.colors.text,
    w: "600",
    t: "tt",
    d: visitors.widgetId,
  });
  return `https://mapmyvisitors.com/map.js?${parameters.toString()}`;
}
