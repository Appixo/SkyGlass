# FR24 Clear View

A browser extension (Chrome + Firefox) that declutters [Flightradar24](https://www.flightradar24.com) so you can actually follow a plane:

- **Full-width map** — hides the right sidebar (premium promos / ads)
- **Compact flight panel** — keeps route, times, altitude and speed, drops the aircraft photo and the 250px ad slot embedded in the panel
- **Hidden panel mode** — a completely clean map
- **Dim panel** — the flight panel goes translucent until you hover it
- **On-map control pill** (bottom-right) — three buttons to toggle the sidebar (◧), cycle the panel full → compact → hidden (▤/▥/□), and toggle dimming (◑)

Settings are also available from the toolbar popup and sync across devices via extension storage.

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
- `content.js` — applies settings, injects the control pill
- `popup.html` / `popup.js` — settings popup

## Notes

- Flightradar24 is a Vue SPA with Tailwind classes; the selectors used (`aside.w-sidebar`, `div.w-84`, `[id^="pb-slot"]`) are the most stable hooks available. If FR24 ships a redesign, they may need updating.
- Needs a browser with CSS `:has()` support (Chrome 105+, Firefox 121+).
