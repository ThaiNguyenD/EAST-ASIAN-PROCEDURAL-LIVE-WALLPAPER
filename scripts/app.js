(() => {
  "use strict";

  const viewport = document.getElementById("landscape");
  const svg = document.getElementById("artwork");
  const scrollLayer = document.getElementById("scroll-layer");
  const drawing = document.getElementById("drawing");
  let chunkNodes = new Map();
  const status = document.getElementById("status");
  const seedInput = document.getElementById("seed");
  const stepInput = document.getElementById("step");
  const autoButton = document.getElementById("auto-scroll");
  const settings = document.getElementById("settings");
  const settingsToggle = document.getElementById("settings-toggle");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const height = 700;
  const buffer = 512;
  const aheadScenes = 3;
  let renderer;
  let scenes = new Map();
  let currentScene = null;
  let preparing = false;
  let requestedX = 0;
  let seed;
  let paper;
  let x = 0;
  let width = 1000;
  let scale = 1;
  let pixelScale = 1;
  let renderedX = 0;
  let renderedWidth = 0;
  let sizeChanged = true;
  let stepDistance = 200;
  let renderFrame = 0;
  let autoFrame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let statusTimer;
  let generation = 0;
  let busy = true;
  let drag = null;

  function announce(message, persistent = false) {
    clearTimeout(statusTimer);
    status.textContent = message;
    if (!persistent) statusTimer = setTimeout(() => { status.textContent = ""; }, 3500);
  }

  function setBusy(value) {
    busy = value;
    viewport.setAttribute("aria-busy", String(value));
    document.querySelectorAll("#previous, #next, #download, #auto-scroll").forEach(button => {
      button.disabled = value;
    });
  }

  function sceneKey(center, sceneWidth = width, resolution = pixelScale) {
    return `${center}:${sceneWidth}:${resolution}`;
  }

  async function buildScene(result, center, sceneWidth, resolution, cache, owner) {
    let canvas = null;
    if (result.bitmap) {
      if (renderer !== owner) { result.bitmap.close(); return null; }
      canvas = document.createElement("canvas");
      canvas.className = "prepared-artwork";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "A generated Shan Shui landscape of mountains, trees, rivers, and boats");
      canvas.width = result.bitmap.width;
      canvas.height = result.bitmap.height;
      const context = canvas.getContext("bitmaprenderer");
      if (context) context.transferFromImageBitmap(result.bitmap);
      else {
        canvas.getContext("2d").drawImage(result.bitmap, 0, 0);
        result.bitmap.close();
      }
    }
    let deadline = performance.now() + 4;
    for (const chunk of result.chunks) {
      if (renderer !== owner) {
        if (canvas) canvas.width = canvas.height = 0;
        return null;
      }
      if (cache.has(chunk.id)) continue;
      if (chunk.canv === null) throw new Error("Missing prepared landscape chunk");
      const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
      // Parse detached nodes in small batches, giving scrolling a turn between
      // batches. Cached chunks are shared by adjacent scenes, never re-parsed.
      let start = 0;
      while (start < chunk.canv.length) {
        let end = chunk.canv.lastIndexOf("/>", start + 32768) + 2;
        if (end <= start) end = chunk.canv.indexOf("/>", start) + 2;
        if (end <= start || chunk.canv.length - end < 32768) end = chunk.canv.length;
        node.insertAdjacentHTML("beforeend", chunk.canv.slice(start, end));
        start = end;
        if (performance.now() >= deadline) {
          await new Promise(resolve => setTimeout(resolve, 0));
          if (renderer !== owner) {
            if (canvas) canvas.width = canvas.height = 0;
            return null;
          }
          deadline = performance.now() + 4;
        }
      }
      cache.set(chunk.id, node);
    }
    return { center, viewportWidth: sceneWidth, resolution, canvas, ids: result.chunks.map(chunk => chunk.id) };
  }

  function presentScene(scene) {
    if (currentScene?.canvas) currentScene.canvas.remove();
    svg.style.display = scene.canvas ? "none" : "block";
    if (scene.canvas) scrollLayer.prepend(scene.canvas);
    const active = new Set(scene.ids);
    for (const [id, node] of chunkNodes) {
      if (node.parentNode === drawing && !active.has(id)) node.remove();
    }
    let next = drawing.firstElementChild;
    for (const id of scene.ids) {
      const node = chunkNodes.get(id);
      if (node === next) next = next.nextElementSibling;
      else drawing.insertBefore(node, next);
    }
    currentScene = scene;
    renderedX = scene.center - buffer;
    renderedWidth = scene.viewportWidth + buffer * 2;
    svg.setAttribute("viewBox", `${renderedX} 0 ${renderedWidth} ${height}`);
    sizeChanged = true;
  }

  function pruneScenes() {
    const center = Math.round(requestedX / buffer) * buffer;
    for (const [key, scene] of scenes) {
      if (scene !== currentScene && (scene.viewportWidth !== width || scene.resolution !== pixelScale ||
          scene.center < center - buffer || scene.center > center + aheadScenes * buffer)) {
        scenes.delete(key);
        if (scene.canvas) scene.canvas.width = scene.canvas.height = 0;
      }
    }
    const retained = new Set(Array.from(scenes.values()).flatMap(scene => scene.ids));
    for (const id of chunkNodes.keys()) {
      if (!retained.has(id)) chunkNodes.delete(id);
    }
  }

  function prepareAhead() {
    if (preparing || busy || !renderer) return;
    const center = Math.round(requestedX / buffer) * buffer;
    let target = !scenes.has(sceneKey(center)) ? center : null;
    const count = autoFrame ? aheadScenes : 1;
    for (let i = 1; target === null && i <= count; i++) {
      const next = center + i * buffer;
      if (!scenes.has(sceneKey(next))) target = next;
    }
    if (target === null) return;
    preparing = true;
    const owner = renderer;
    const cache = chunkNodes;
    const sceneWidth = width;
    const resolution = pixelScale;
    owner.request({ type: "render", x: target, width: sceneWidth, pixelScale: resolution, known: Array.from(cache.keys()) })
      .then(result => buildScene(result, target, sceneWidth, resolution, cache, owner))
      .then(scene => {
        if (renderer !== owner || !scene) return;
        scenes.set(sceneKey(target, sceneWidth, resolution), scene);
        preparing = false;
        pruneScenes();
        render();
      })
      .catch(error => {
        if (renderer !== owner) return;
        // Leave the current view intact, and stop retrying until regeneration.
        stopAuto();
        announce("Could not prepare more scenery. Try another seed in Settings.", true);
        console.error(error);
      });
  }

  function draw() {
    renderFrame = 0;
    if (!currentScene || busy) return;
    const center = Math.round(requestedX / buffer) * buffer;
    const ready = scenes.get(sceneKey(center));
    if (ready && ready !== currentScene) presentScene(ready);
    // Never scroll into an unprepared area. If preparation falls behind, hold
    // at the last complete view instead of generating synchronously or jumping.
    x = Math.max(renderedX, Math.min(requestedX, renderedX + Math.max(0, renderedWidth - width)));
    if (sizeChanged) {
      scrollLayer.style.width = `${renderedWidth * scale}px`;
      sizeChanged = false;
    }
    scrollLayer.style.transform = `translate3d(${(renderedX - x) * scale}px, 0, 0)`;
    prepareAhead();
  }

  function measureViewport() {
    const rect = viewport.getBoundingClientRect();
    scale = rect.height / height;
    width = Math.max(1, rect.width / scale);
    // Bound each cached image to four megapixels, including on high-DPI phones.
    pixelScale = Math.min(scale * (window.devicePixelRatio || 1), Math.sqrt(4e6 / ((width + buffer * 2) * height)));
    sizeChanged = true;
    render();
  }

  function render() {
    if (!renderFrame) renderFrame = requestAnimationFrame(() => {
      try {
        draw();
      } catch (error) {
        stopAuto();
        announce("Could not draw this landscape. Try another seed in Settings.", true);
        console.error(error);
      }
    });
  }

  function step() {
    const value = Number(stepInput.value);
    const valid = Number.isFinite(value) && value >= 20 && value <= 2000;
    const distance = valid ? Math.round(value / 20) * 20 : 200;
    if (stepInput.value !== String(distance)) stepInput.value = String(distance);
    stepDistance = distance;
    return distance;
  }

  function move(distance) {
    if (busy || !Number.isFinite(distance)) return;
    requestedX += distance;
    render();
  }

  function stopAuto() {
    if (autoFrame) requestedX = x;
    cancelAnimationFrame(autoFrame);
    autoFrame = 0;
    lastTime = 0;
    elapsed = 0;
    autoButton.setAttribute("aria-pressed", "false");
    autoButton.textContent = "Auto-scroll";
  }

  function autoScroll(time) {
    const delta = lastTime ? Math.min(time - lastTime, 100) : 0;
    lastTime = time;
    if (reducedMotion.matches) {
      elapsed += delta;
      if (elapsed >= 2000) { requestedX += stepDistance; elapsed = 0; }
    } else {
      requestedX = x + stepDistance * delta / 4000;
    }
    // Update and draw in one animation callback, without a second frame queue.
    cancelAnimationFrame(renderFrame);
    try {
      draw();
    } catch (error) {
      stopAuto();
      announce("Could not draw this landscape. Try another seed in Settings.", true);
      console.error(error);
      return;
    }
    autoFrame = requestAnimationFrame(autoScroll);
  }

  function randomSeed() {
    const words = new Uint32Array(2);
    crypto.getRandomValues(words);
    return Array.from(words, word => word.toString(36)).join("-");
  }

  function seedFromURL() {
    return new URL(window.location.href).searchParams.get("seed") || randomSeed();
  }

  function saveSeedToURL(value, replace) {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", value);
    try {
      history[replace ? "replaceState" : "pushState"](null, "", url);
    } catch {
      // Some browsers disallow history updates when opened directly via file://.
    }
  }

  async function generate(value, historyMode = "push") {
    const currentGeneration = ++generation;
    stopAuto();
    if (renderer) renderer.dispose();
    if (currentScene?.canvas) currentScene.canvas.remove();
    for (const scene of scenes.values()) {
      if (scene.canvas) scene.canvas.width = scene.canvas.height = 0;
    }
    const nextSeed = value || randomSeed();
    const owner = window.createLandscapeRenderer(nextSeed);
    renderer = owner;
    scenes = new Map();
    chunkNodes = new Map();
    const cache = chunkNodes;
    currentScene = null;
    preparing = false;
    setBusy(true);
    announce("Drawing your landscape…", true);
    try {
      const sceneWidth = width;
      const resolution = pixelScale;
      const result = await owner.request({ type: "start", x: 0, width: sceneWidth, pixelScale: resolution });
      const scene = await buildScene(result, 0, sceneWidth, resolution, cache, owner);
      if (currentGeneration !== generation || !scene) return;
      seed = nextSeed;
      x = requestedX = 0;
      drawing.replaceChildren();
      scenes.set(sceneKey(0, sceneWidth, resolution), scene);
      presentScene(scene);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d");
      if (context) context.putImageData(new ImageData(result.paper, 512, 512), 0, 0);
      paper = context ? canvas.toDataURL("image/png") : "";
      document.body.style.backgroundImage = paper ? `url("${paper}")` : "";
      seedInput.value = seed;
      if (historyMode !== "none") saveSeedToURL(seed, historyMode === "replace");
      setBusy(false);
      draw();
      announce("");
    } catch (error) {
      if (currentGeneration !== generation) return;
      setBusy(true);
      announce("Could not draw this landscape. Try another seed in Settings.", true);
      console.error(error);
    }
  }

  function download() {
    draw();
    const copy = svg.cloneNode(true);
    copy.removeAttribute("style");
    copy.setAttribute("viewBox", `${x} 0 ${width} ${height}`);
    copy.setAttribute("width", String(Math.round(width)));
    copy.setAttribute("height", String(height));
    const ns = "http://www.w3.org/2000/svg";
    const background = document.createElementNS(ns, "rect");
    background.setAttribute("x", String(x));
    background.setAttribute("width", String(width));
    background.setAttribute("height", String(height));
    background.setAttribute("fill", "#eee7d7");
    copy.insertBefore(background, copy.querySelector("g"));
    if (paper) {
      const defs = document.createElementNS(ns, "defs");
      const pattern = document.createElementNS(ns, "pattern");
      pattern.id = "paper";
      pattern.setAttribute("width", "512");
      pattern.setAttribute("height", "512");
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      const image = document.createElementNS(ns, "image");
      image.setAttribute("href", paper);
      image.setAttribute("width", "512");
      image.setAttribute("height", "512");
      pattern.append(image);
      defs.append(pattern);
      copy.prepend(defs);
      background.setAttribute("fill", "url(#paper)");
    }
    copy.querySelector("g").setAttribute("style", "mix-blend-mode:multiply");
    const source = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(copy);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    const filename = seed.replace(/[^a-z0-9_-]/gi, "_").slice(0, 60) || "landscape";
    link.download = `shan-shui-${filename}.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("Your landscape has been saved as SVG.");
  }

  settingsToggle.addEventListener("click", () => {
    settings.hidden = !settings.hidden;
    settingsToggle.setAttribute("aria-expanded", String(!settings.hidden));
    if (!settings.hidden) seedInput.focus();
  });
  document.getElementById("seed-form").addEventListener("submit", event => {
    event.preventDefault();
    generate(seedInput.value);
  });
  document.getElementById("random-seed").addEventListener("click", () => generate(randomSeed()));
  stepInput.addEventListener("change", step);
  document.getElementById("previous").addEventListener("click", () => { stopAuto(); move(-step()); });
  document.getElementById("next").addEventListener("click", () => { stopAuto(); move(step()); });
  document.getElementById("download").addEventListener("click", download);
  autoButton.addEventListener("click", () => {
    if (autoFrame) return stopAuto();
    step();
    autoButton.setAttribute("aria-pressed", "true");
    autoButton.textContent = "Pause";
    autoFrame = requestAnimationFrame(autoScroll);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopAuto(); });
  window.addEventListener("popstate", () => generate(seedFromURL(), "none"));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      stopAuto();
      if (!settings.hidden) {
        settings.hidden = true;
        settingsToggle.setAttribute("aria-expanded", "false");
        settingsToggle.focus();
      }
    }
    if (event.target.closest("input, textarea, select, [contenteditable]") || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      stopAuto();
      move((event.key === "ArrowLeft" ? -1 : 1) * step());
    }
  });
  viewport.addEventListener("pointerdown", event => {
    if (busy || !event.isPrimary || event.button !== 0) return;
    stopAuto();
    drag = { id: event.pointerId, start: event.clientX, x };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("dragging");
    viewport.focus({ preventScroll: true });
  });
  viewport.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId || busy) return;
    requestedX = drag.x + (drag.start - event.clientX) * width / viewport.clientWidth;
    render();
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    viewport.classList.remove("dragging");
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("lostpointercapture", endDrag);
  new ResizeObserver(measureViewport).observe(viewport);
  measureViewport();
  generate(seedFromURL(), "replace");
})();
