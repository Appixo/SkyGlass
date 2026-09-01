// FR24 Clear View — page-world hook (runs at document_start in the MAIN world).
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

  function setWeather(on, tilePath) {
    const g = window.google;
    if (!g?.maps?.ImageMapType) return;
    for (const m of capturedMaps) {
      for (let i = m.overlayMapTypes.getLength() - 1; i >= 0; i--) {
        if (m.overlayMapTypes.getAt(i)?.name === "fcv-rain") {
          m.overlayMapTypes.removeAt(i);
        }
      }
    }
    overlay = null;
    if (on && tilePath && capturedMaps.length) {
      overlay = new g.maps.ImageMapType({
        getTileUrl: (c, z) =>
          `https://tilecache.rainviewer.com${tilePath}/256/${z}/${c.x}/${c.y}/2/1_1.png`,
        tileSize: new g.maps.Size(256, 256),
        opacity: 0.55,
        name: "fcv-rain",
      });
      for (const m of capturedMaps) m.overlayMapTypes.push(overlay);
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
