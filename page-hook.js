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

  let dimOverlay = null;
  let dimTileUrl = null;

  function getDimTileUrl() {
    if (!dimTileUrl) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 256, 256);
      dimTileUrl = c.toDataURL("image/png");
    }
    return dimTileUrl;
  }

  // Dim the basemap with a translucent black tile layer. Overlay tiles on
  // vector maps composite below FR24's WebGL-drawn aircraft, so planes and
  // trails stay at full brightness while the map fades back.
  function setDim(opacity) {
    const g = window.google;
    if (!g?.maps?.ImageMapType || !capturedMaps.length) {
      // Map not up yet — retry until it is.
      if (opacity > 0) setTimeout(() => setDim(opacity), 1000);
      return;
    }
    if (!dimOverlay && opacity > 0) {
      const url = getDimTileUrl();
      dimOverlay = new g.maps.ImageMapType({
        getTileUrl: () => url,
        tileSize: new g.maps.Size(256, 256),
        opacity,
        name: "fcv-dim",
      });
      for (const m of capturedMaps) m.overlayMapTypes.insertAt(0, dimOverlay);
    } else if (dimOverlay && opacity > 0) {
      dimOverlay.setOpacity(opacity);
    } else if (dimOverlay && opacity <= 0) {
      for (const m of capturedMaps) {
        for (let i = m.overlayMapTypes.getLength() - 1; i >= 0; i--) {
          if (m.overlayMapTypes.getAt(i)?.name === "fcv-dim") {
            m.overlayMapTypes.removeAt(i);
          }
        }
      }
      dimOverlay = null;
    }
  }

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
    if (e.data.cmd === "dim") setDim(e.data.opacity);
  });
})();
