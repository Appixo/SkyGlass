// SkyGlass — background fetcher.
// Firefox content scripts can't make cross-origin requests even with host
// permissions, so the RainViewer API call happens here in both browsers.

const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.cmd !== "fcv-rain-path") return;
  fetch("https://api.rainviewer.com/public/weather-maps.json")
    .then((r) => r.json())
    .then((d) => sendResponse({ tilePath: d?.radar?.past?.at(-1)?.path ?? null }))
    .catch(() => sendResponse({ tilePath: null }));
  return true; // keep the message channel open for the async response
});
