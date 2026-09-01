// SkyGlass — page-world hook (runs at document_start in the MAIN world).
// Captures Google Maps Map instances as the site creates them, so the
// content script can toggle a RainViewer rain-radar overlay on the real map.

(() => {
  const capturedMaps = [];
  let overlay = null;

  function wrapMapClass(Orig) {
    if (!Orig || Orig.__fcvWrapped) return Orig;
    function Patched(...args) {
      const m = Reflect.construct(Orig, args, new.target || Patched);
      capturedMaps.push(m);
      return m;
    }
    Patched.prototype = Orig.prototype;
    Object.setPrototypeOf(Patched, Orig);
    Patched.__fcvWrapped = true;
    return Patched;
  }

  // Intercept window.google -> google.maps -> maps.Map as each level appears.
  function hookMapsNamespace(mapsObj) {
    if (!mapsObj || mapsObj.__fcvHooked) return;
    mapsObj.__fcvHooked = true;
    if (mapsObj.Map) {
      mapsObj.Map = wrapMapClass(mapsObj.Map);
    } else {
      let stored;
      Object.defineProperty(mapsObj, "Map", {
        configurable: true,
        enumerable: true,
        get: () => stored,
        set: (v) => { stored = wrapMapClass(v); },
      });
    }
  }

  function hookGoogle(g) {
    if (!g) return;
    if (g.maps) {
      hookMapsNamespace(g.maps);
    } else {
      let storedMaps;
      try {
        Object.defineProperty(g, "maps", {
          configurable: true,
          enumerable: true,
          get: () => storedMaps,
          set: (v) => { storedMaps = v; hookMapsNamespace(v); },
        });
      } catch { /* already non-configurable; polling fallback covers it */ }
    }
  }

  if (window.google) {
    hookGoogle(window.google);
  } else {
    let storedGoogle;
    try {
      Object.defineProperty(window, "google", {
        configurable: true,
        enumerable: true,
        get: () => storedGoogle,
        set: (v) => { storedGoogle = v; hookGoogle(v); },
      });
    } catch { /* fall through to polling */ }
  }

  // Safety net in case a defineProperty was skipped.
  const poll = setInterval(() => {
    const g = window.google;
    if (g?.maps?.Map && !g.maps.Map.__fcvWrapped) hookMapsNamespace(g.maps);
    if (g?.maps?.Map?.__fcvWrapped) clearInterval(poll);
  }, 250);
  setTimeout(() => clearInterval(poll), 30000);

  // FR24's map is a WebGL *vector* map, where overlayMapTypes/ImageMapType
  // never render. Rain tiles are drawn instead with an OverlayView: plain
  // <img> tiles positioned via the map projection, which works on vector maps
  // and sits below FR24's aircraft canvas.
  function makeRainOverlay(tilePath) {
    const g = window.google;
    class RainOverlay extends g.maps.OverlayView {
      constructor(path) {
        super();
        this.path = path;
        this.div = null;
      }
      onAdd() {
        this.div = document.createElement("div");
        this.div.className = "fcv-rain-layer";
        this.div.style.cssText = "position:absolute;pointer-events:none;";
        this.getPanes().overlayLayer.appendChild(this.div);
      }
      onRemove() {
        if (this.div) this.div.remove();
        this.div = null;
      }
      draw() {
        const proj = this.getProjection();
        const map = this.getMap();
        if (!proj || !map || !this.div) return;
        const bounds = map.getBounds();
        if (!bounds) return;
        const z = Math.max(1, Math.min(12, Math.floor(map.getZoom())));
        const scale = 1 << z;
        const toTile = (lat, lng) => {
          const s = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)));
          return {
            x: ((lng + 180) / 360) * scale,
            y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
          };
        };
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const tl = toTile(ne.lat(), sw.lng());
        const br = toTile(sw.lat(), ne.lng());
        const x0 = Math.floor(tl.x);
        let x1 = Math.floor(br.x);
        if (x1 < x0) x1 += scale; // antimeridian wrap
        const y0 = Math.max(0, Math.floor(tl.y));
        const y1 = Math.min(scale - 1, Math.floor(br.y));
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 100) return; // safety cap

        const tileLat = (ty) =>
          (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / scale))) * 180) / Math.PI;
        const keep = new Set();
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const key = `${z}/${x}/${y}`;
            keep.add(key);
            let img = this.div.querySelector(`img[data-k="${key}"]`);
            if (!img) {
              img = document.createElement("img");
              img.dataset.k = key;
              const wx = ((x % scale) + scale) % scale;
              img.src = `https://tilecache.rainviewer.com${this.path}/256/${z}/${wx}/${y}/2/1_1.png`;
              img.style.cssText = "position:absolute;opacity:0.55;";
              this.div.appendChild(img);
            }
            const p1 = proj.fromLatLngToDivPixel(
              new g.maps.LatLng(tileLat(y), (x / scale) * 360 - 180)
            );
            const p2 = proj.fromLatLngToDivPixel(
              new g.maps.LatLng(tileLat(y + 1), ((x + 1) / scale) * 360 - 180)
            );
            if (!p1 || !p2) continue;
            img.style.left = p1.x + "px";
            img.style.top = p1.y + "px";
            img.style.width = p2.x - p1.x + "px";
            img.style.height = p2.y - p1.y + "px";
          }
        }
        for (const img of [...this.div.querySelectorAll("img")]) {
          if (!keep.has(img.dataset.k)) img.remove();
        }
      }
    }
    return new RainOverlay(tilePath);
  }

  function setWeather(on, tilePath) {
    const g = window.google;
    if (!g?.maps?.OverlayView) return;
    if (overlay) {
      overlay.setMap(null);
      overlay = null;
    }
    if (on && tilePath && capturedMaps.length) {
      overlay = makeRainOverlay(tilePath);
      overlay.setMap(capturedMaps[capturedMaps.length - 1]);
    }
    window.postMessage(
      { source: "fcv-page", cmd: "weather-state", active: !!overlay, mapsCaptured: capturedMaps.length },
      "*"
    );
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.source !== "fcv") return;
    if (e.data.cmd === "weather") setWeather(e.data.on, e.data.tilePath);
  });
})();
