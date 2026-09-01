# SkyGlass

A browser extension (Chrome + Firefox) that declutters [Flightradar24](https://www.flightradar24.com) so you can actually follow a plane:

- **Full-width map** — hides the right sidebar (premium promos / ads)
- **Compact flight panel** — keeps route, times, altitude and speed, drops the aircraft photo and the 250px ad slot embedded in the panel
- **Hidden panel mode** — a completely clean map
- **Dim panel** — the flight panel goes translucent until you hover it
- **Auto-follow** — keeps the selected flight followed; if following ever drops (map drag, panel re-render), it re-engages within seconds
- **Focus mode** — a spotlight tracks the followed aircraft (its live position projected through the map) and fades every other plane to a ghost; it only engages while a flight is actually followed, so it never hides the plane you care about
- **Map themes** — Normal / Grayscale / Sepia / Night (inverted); the aircraft layer is drawn separately, so planes stay bright yellow even on the night map
- **Basemap dimming** — darkens only the map tiles (planes, trails and labels keep full brightness)
- **Plane opacity** — global slider for the aircraft layer
- **Keyboard shortcuts** — `S` sidebar, `P` panel cycle, `D` dim panel, `A` auto-follow, `O` focus mode, `T` cycle map theme, `M` cycle map dimming
- **On-map control pill** (bottom-right) — sidebar (◧), panel cycle (▤/▥/□), panel dimming (◑), auto-follow (⌖), focus mode (◎)

The toolbar popup carries only what the pill doesn't: ad removal, pill visibility, map theme and the two sliders.

> FR24's actual premium features (extended history, alerts, weather layers, unlimited 3D) are gated server-side by their subscription — this extension doesn't and won't unlock those.

## Install (Chrome / Edge)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder

## Install (Firefox)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** and select `manifest.json`

(Temporary add-ons are removed when Firefox restarts. For a permanent install, the extension needs to be signed via [addons.mozilla.org](https://addons.mozilla.org) — a self-distributed unlisted signing works fine.)

## Files

- `manifest.json` — MV3 manifest, works in both Chrome and Firefox (the `browser_specific_settings` key is ignored by Chrome)
- `content.css` — all visual rules, gated behind `fcv-*` classes on `<html>`
- `content.js` — applies settings, injects the control pill, keyboard shortcuts, auto-follow and focus tracking
- `page-hook.js` — runs in the page world at `document_start`; wraps `google.maps.Map` to capture the map instance and answer lat/lng → pixel projection requests for the focus spotlight
- `popup.html` / `popup.js` — settings popup

## Notes

- Selectors use FR24's own `data-testid` attributes where they exist (`aircraft-panel`, `aircraft__follow-flight-button`, …) — far more stable than Tailwind classes. A few fallbacks (`aside.w-sidebar`, `[id^="pb-slot"]`) remain for elements without testids.
- FR24 renders aircraft on a dedicated full-screen canvas outside the Google Maps container. That's what makes focus mode, plane opacity, basemap dimming and planes-stay-bright themes possible with pure CSS.
- Verified in real Firefox (via `web-ext`/WebDriver BiDi) and Chromium: sidebar/ads removal, panel modes, themes, dimming, focus-mode masking and its follow-gated fail-safe.
- Hiding individual *other* aircraft entirely isn't possible client-side (all planes share one WebGL canvas); focus mode's radial mask is the closest equivalent, and it works because following keeps your plane at screen center.
- Needs a browser with CSS `:has()` and `mask-image` support (Chrome 120+, Firefox 121+).
