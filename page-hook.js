// SkyGlass — page-world hook (runs at document_start in the MAIN world).
// Captures Google Maps Map instances as the site creates them and answers
// lat/lng → container-pixel projection requests, so the content script can
// anchor the focus-mode spotlight on the followed aircraft.

(() => {
  const capturedMaps = [];

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

  // A no-op OverlayView attached to the map, purely to borrow its projection
  // (fromLatLngToContainerPixel works on vector maps).
  let projector = null;
  function ensureProjector() {
    const g = window.google;
    if (!g?.maps?.OverlayView || !capturedMaps.length) return null;
    if (projector && projector.getMap()) return projector;
    class Projector extends g.maps.OverlayView {
      onAdd() {}
      onRemove() {}
      draw() {}
    }
    projector = new Projector();
    projector.setMap(capturedMaps[capturedMaps.length - 1]);
    return projector;
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.source !== "fcv") return;
    if (e.data.cmd === "project") {
      const g = window.google;
      const p = ensureProjector();
      const proj = p && p.getProjection();
      let reply = { source: "fcv-page", cmd: "projected", ok: false };
      if (proj && Number.isFinite(e.data.lat) && Number.isFinite(e.data.lng)) {
        const px = proj.fromLatLngToContainerPixel(
          new g.maps.LatLng(e.data.lat, e.data.lng)
        );
        if (px) reply = { ...reply, ok: true, x: px.x, y: px.y };
      }
      window.postMessage(reply, "*");
    }
  });
})();
