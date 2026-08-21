(() => {
  const root = document.querySelector("[data-money-lab]");
  const stage = document.querySelector("[data-money-stage]");
  const floor = document.querySelector("[data-money-floor]");
  const frontInput = document.querySelector("[data-front-input]");
  const backInput = document.querySelector("[data-back-input]");
  const dropZone = document.querySelector("[data-drop-zone]");
  const fileStatus = document.querySelector("[data-file-status]");
  const previewImage = document.querySelector("[data-preview-image]");
  const clearButton = document.querySelector("[data-clear-floor]");
  const status = document.querySelector("[data-stage-status]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!root || !stage || !floor || !clearButton) return;

  const currencies = {
    cny: { symbol: "¥", denomination: "¥100", name: "人民币", color: "#d9e9b7" },
    usd: { symbol: "$", denomination: "$100", name: "美元", color: "#b9d3e3" },
    eur: { symbol: "€", denomination: "€100", name: "欧元", color: "#d9c7dc" },
    jpy: { symbol: "¥", denomination: "¥1000", name: "日元", color: "#eddaa5" },
    gbp: { symbol: "£", denomination: "£100", name: "英镑", color: "#e7c0af" },
    krw: { symbol: "₩", denomination: "₩10000", name: "韩元", color: "#c8c9e6" }
  };

  const MAX_NOTES = 280;
  const FLOOR_RATIO = .17;
  const notes = new Set();
  const landedNotes = [];
  const spawnQueue = [];
  const objectUrls = new Set();
  const textures = { front: null, back: null };
  const sampleTextures = {};
  const pointer = { x: 0, y: 0 };
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  let selectedCurrency = "cny";
  let currentRun = 0;
  let frameId = 0;
  let lastFrameTime = 0;
  let pixelRatio = 1;
  let wind = 0;
  let windTarget = 0;
  let clock = 0;
  let previousFloorTop = 0;

  if (!context) return;

  canvas.className = "money-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.moneyCanvas = "true";
  stage.appendChild(canvas);
  floor.hidden = true;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const setStatus = (message) => {
    if (status) status.textContent = message;
  };
  const stageSize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    return { width, height, floorHeight: height * FLOOR_RATIO, floorTop: height * (1 - FLOOR_RATIO) };
  };
  const imageReady = (image) => Boolean(image && ((image instanceof HTMLCanvasElement) || (image.complete && image.naturalWidth > 0)));
  const currentFrontTexture = () => imageReady(textures.front) ? textures.front : sampleTextures[selectedCurrency];
  const currentBackTexture = () => imageReady(textures.back) ? textures.back : currentFrontTexture();

  const createSampleTexture = (currency) => {
    const texture = document.createElement("canvas");
    texture.width = 720;
    texture.height = 405;
    const textureContext = texture.getContext("2d");
    if (!textureContext) return texture;
    textureContext.fillStyle = currency.color;
    textureContext.fillRect(0, 0, texture.width, texture.height);
    textureContext.globalAlpha = .2;
    for (let x = -texture.height; x < texture.width; x += 32) {
      textureContext.beginPath();
      textureContext.moveTo(x, 0);
      textureContext.lineTo(x + texture.height, texture.height);
      textureContext.stroke();
    }
    textureContext.globalAlpha = .18;
    for (let x = 20; x < texture.width; x += 22) {
      for (let y = 22; y < texture.height; y += 22) {
        textureContext.beginPath();
        textureContext.arc(x, y, 2.2, 0, Math.PI * 2);
        textureContext.fillStyle = "#28523a";
        textureContext.fill();
      }
    }
    textureContext.globalAlpha = 1;
    textureContext.fillStyle = "rgba(27, 44, 37, .87)";
    textureContext.font = "700 28px ui-monospace, SFMono-Regular, Menlo, monospace";
    textureContext.fillText("SAMPLE / 样票", 34, 55);
    textureContext.font = "800 92px system-ui, sans-serif";
    textureContext.fillText(currency.denomination, 32, 190);
    textureContext.font = "800 64px system-ui, sans-serif";
    textureContext.fillText(currency.symbol, 602, 344);
    textureContext.font = "22px ui-monospace, SFMono-Regular, Menlo, monospace";
    textureContext.fillText("非法定货币 · 仅作视觉效果", 34, 356);
    textureContext.strokeStyle = "rgba(27, 44, 37, .6)";
    textureContext.lineWidth = 3;
    textureContext.beginPath();
    textureContext.arc(618, 75, 35, 0, Math.PI * 2);
    textureContext.stroke();
    return texture;
  };

  Object.keys(currencies).forEach((key) => {
    sampleTextures[key] = createSampleTexture(currencies[key]);
  });

  const activeDrops = () => spawnQueue.length
    + Array.from(notes).filter((paper) => paper.phase !== "landed").length;

  const resizeCanvas = () => {
    const size = stageSize();
    const oldFloorTop = previousFloorTop || size.floorTop;
    pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * pixelRatio);
    canvas.height = Math.round(size.height * pixelRatio);
    canvas.style.width = size.width + "px";
    canvas.style.height = size.height + "px";
    notes.forEach((paper) => {
      if (paper.phase === "landed" && previousFloorTop) {
        paper.y += size.floorTop - oldFloorTop;
        paper.targetY += size.floorTop - oldFloorTop;
      }
      paper.floorTopAtRest = size.floorTop;
    });
    previousFloorTop = size.floorTop;
    drawScene();
  };

  const normalizeAngle = (angle) => {
    return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  };

  const drawPaperShadow = (paper, size, crowded) => {
    const distance = Math.max(0, size.floorTop - paper.y);
    const alpha = crowded
      ? clamp(.1 - distance / (size.height * 4), .018, .08)
      : clamp(.2 - distance / (size.height * 3), .025, .18);
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = "rgba(45, 47, 43, .72)";
    context.beginPath();
    context.ellipse(paper.x, size.floorTop + 10, paper.width * .31 * paper.scale, 5 * paper.scale, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const drawPaper = (paper, crowded) => {
    const texture = paper.side === "back" ? paper.textureBack : paper.textureFront;
    if (!imageReady(texture)) return;

    const textureWidth = texture.naturalWidth || texture.width;
    const textureHeight = texture.naturalHeight || texture.height;
    const stripCount = crowded ? 3 : 4;
    const stripWidth = paper.width / stripCount;
    const halfWidth = paper.width / 2;
    const halfHeight = paper.height / 2;
    const bend = paper.bend * (paper.phase === "landed" ? .62 : 1);
    const previousAlpha = context.globalAlpha;

    context.save();
    context.translate(paper.x, paper.y + paper.settleLift);
    context.rotate(paper.rotation);
    context.scale(paper.scale, paper.scale);
    context.globalAlpha = paper.opacity;

    for (let index = 0; index < stripCount; index += 1) {
      const x0 = -halfWidth + index * stripWidth;
      const x1 = x0 + stripWidth;
      const wave0 = Math.sin(paper.wave + index * 1.13) * bend;
      const wave1 = Math.sin(paper.wave + (index + 1) * 1.13) * bend;
      const top0 = -halfHeight + wave0;
      const top1 = -halfHeight + wave1;
      const bottom0 = halfHeight + Math.sin(paper.wave * .77 + index * 1.17) * bend * .62;
      const bottom1 = halfHeight + Math.sin(paper.wave * .77 + (index + 1) * 1.17) * bend * .62;
      const sourceX = index * textureWidth / stripCount;
      const sourceWidth = textureWidth / stripCount;

      context.save();
      context.beginPath();
      context.moveTo(x0, top0);
      context.lineTo(x1, top1);
      context.lineTo(x1, bottom1);
      context.lineTo(x0, bottom0);
      context.closePath();
      context.clip();
      context.drawImage(
        texture,
        sourceX,
        0,
        sourceWidth + 1,
        textureHeight,
        x0 - 1,
        -halfHeight - 2,
        stripWidth + 2,
        paper.height + 4
      );
      context.restore();
    }

    context.beginPath();
    context.moveTo(-halfWidth, -halfHeight + Math.sin(paper.wave) * bend);
    for (let index = 1; index <= stripCount; index += 1) {
      const x = -halfWidth + index * stripWidth;
      context.lineTo(x, -halfHeight + Math.sin(paper.wave + index * 1.13) * bend);
    }
    for (let index = stripCount; index >= 0; index -= 1) {
      const x = -halfWidth + index * stripWidth;
      context.lineTo(x, halfHeight + Math.sin(paper.wave * .77 + index * 1.17) * bend * .62);
    }
    context.closePath();
    context.strokeStyle = "rgba(34, 36, 33, .34)";
    context.lineWidth = .75;
    context.stroke();

    context.strokeStyle = "rgba(255, 255, 255, .24)";
    context.lineWidth = .7;
    for (let index = 1; index < stripCount; index += 1) {
      const x = -halfWidth + index * stripWidth;
      const crease = Math.sin(paper.wave + index * 1.13) * bend;
      context.beginPath();
      context.moveTo(x, -halfHeight + crease + 2);
      context.lineTo(x, halfHeight + Math.sin(paper.wave * .77 + index * 1.17) * bend * .62 - 2);
      context.stroke();
    }

    context.globalAlpha = previousAlpha;
    context.restore();
  };

  const drawScene = () => {
    const size = stageSize();
    const crowded = notes.size > 60 || spawnQueue.length > 60;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, size.width, size.height);

    const orderedNotes = Array.from(notes).sort((left, right) => {
      return left.level - right.level || left.depth - right.depth;
    });
    orderedNotes.forEach((paper) => drawPaperShadow(paper, size, crowded));
    orderedNotes.forEach((paper) => drawPaper(paper, crowded));
    root.dataset.noteCount = String(notes.size);
    root.dataset.activeDrops = String(activeDrops());
  };

  const trimNotes = () => {
    while (notes.size > MAX_NOTES && landedNotes.length) {
      const oldest = landedNotes.shift();
      if (oldest) notes.delete(oldest);
    }
  };

  const landPaper = (paper) => {
    if (paper.phase === "landed" || paper.phase === "settling") return;
    paper.phase = "settling";
    paper.settleProgress = reducedMotion.matches ? 1 : 0;
    paper.settleStartRotation = paper.rotation;
    paper.settleTargetRotation = paper.rotation + normalizeAngle((Math.random() - .5) * .36 - paper.rotation);
    paper.settleStartBend = paper.bend;
    paper.settleTargetBend = 2 + Math.random() * 4;
    paper.settleLift = 0;
    paper.vx = 0;
    paper.vy = 0;
    paper.vrotation = 0;
    paper.bounceCount = 0;
  };

  const createPaper = (level) => {
    const width = stage.clientWidth < 650 ? 164 : 220;
    const height = width * .5625;
    const hasBack = imageReady(textures.back);
    return {
      level,
      width,
      height,
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      vx: 0,
      vy: 0,
      rotation: (Math.random() - .5) * .65,
      vrotation: (Math.random() - .5) * .055,
      wave: Math.random() * Math.PI * 2,
      bend: 8 + Math.random() * 12,
      scale: .88 + Math.random() * .18,
      opacity: .76 + Math.random() * .2,
      depth: Math.random() * 100,
      side: hasBack && Math.random() > .58 ? "back" : "front",
      phase: "falling",
      bounceCount: 0,
      settleProgress: 0,
      settleLift: 0,
      settleStartRotation: 0,
      settleTargetRotation: 0,
      settleStartBend: 0,
      settleTargetBend: 0,
      textureFront: currentFrontTexture(),
      textureBack: currentBackTexture(),
      uploaded: Boolean(textures.front),
      runId: currentRun
    };
  };

  const spawnPaper = (level, runId) => {
    if (runId !== currentRun) return;
    const paper = createPaper(level);
    const size = stageSize();
    const floor = size.floorTop - paper.height / 2 - Math.min(level, 110) * 1.15;
    paper.x = paper.width / 2 + Math.random() * Math.max(1, size.width - paper.width);
    paper.y = -paper.height / 2 - Math.random() * 110;
    paper.targetX = paper.width / 2 + Math.random() * Math.max(1, size.width - paper.width);
    paper.targetY = floor;
    paper.vx = (paper.targetX - paper.x) * .001 + (Math.random() - .5) * 1.4;
    paper.vy = .55 + Math.random() * .65;
    notes.add(paper);
    if (reducedMotion.matches) landPaper(paper);
  };

  const updatePaper = (paper, timeScale) => {
    if (paper.phase === "landed") return;

    if (paper.phase === "settling") {
      paper.settleProgress = clamp(paper.settleProgress + timeScale / 15, 0, 1);
      const eased = 1 - Math.pow(1 - paper.settleProgress, 3);
      paper.rotation = paper.settleStartRotation
        + normalizeAngle(paper.settleTargetRotation - paper.settleStartRotation) * eased;
      paper.bend = paper.settleStartBend + (paper.settleTargetBend - paper.settleStartBend) * eased;
      paper.settleLift = -Math.sin(Math.PI * paper.settleProgress) * 3.2;
      if (paper.settleProgress >= 1) {
        paper.phase = "landed";
        paper.y = paper.targetY;
        paper.settleLift = 0;
        landedNotes.push(paper);
        trimNotes();
      }
      return;
    }

    const stageSizeNow = stageSize();
    const air = wind * .012 * timeScale;
    const steering = (paper.targetX - paper.x) * .00022 * timeScale;
    paper.vx += air + steering;
    paper.vx *= Math.pow(.993, timeScale);
    paper.vy += .18 * timeScale;
    paper.vy *= Math.pow(.998, timeScale);
    paper.x += paper.vx * timeScale;
    paper.y += paper.vy * timeScale;
    paper.rotation += paper.vrotation * timeScale;
    paper.wave += (.08 + Math.abs(paper.vy) * .018) * timeScale;
    paper.bend = clamp(
      paper.bend + (Math.sin(paper.wave * 1.31) * .12 + wind * .012) * timeScale,
      2,
      22
    );
    paper.vrotation *= Math.pow(.997, timeScale);

    if (paper.x < -paper.width * .4 || paper.x > stageSizeNow.width + paper.width * .4) {
      paper.vx *= -.72;
    }

    if (paper.y >= paper.targetY && paper.vy > 0) {
      paper.y = paper.targetY;
      paper.vy = -Math.abs(paper.vy) * .22;
      paper.vx *= .62;
      paper.vrotation *= .52;
      paper.bounceCount += 1;
      if (paper.bounceCount >= 2 || Math.abs(paper.vy) < .72) landPaper(paper);
    }
  };

  const tick = (timestamp) => {
    frameId = 0;
    const timeScale = lastFrameTime ? clamp((timestamp - lastFrameTime) / 16.67, .5, 2.4) : 1;
    lastFrameTime = timestamp;
    clock += timeScale;

    const batchSize = reducedMotion.matches ? spawnQueue.length : (activeDrops() > 60 ? 12 : 4);
    for (let index = 0; index < batchSize && spawnQueue.length; index += 1) {
      const item = spawnQueue.shift();
      if (item.runId === currentRun) spawnPaper(item.level, item.runId);
    }

    wind += (windTarget - wind) * .07;
    windTarget *= .94;
    notes.forEach((paper) => updatePaper(paper, timeScale));
    drawScene();

    if (spawnQueue.length || Array.from(notes).some((paper) => paper.phase !== "landed")) {
      frameId = window.requestAnimationFrame(tick);
    } else {
      lastFrameTime = 0;
      setStatus("地面已有 " + landedNotes.length + " 张样票。");
    }
  };

  const schedule = () => {
    if (!frameId) {
      lastFrameTime = 0;
      frameId = window.requestAnimationFrame(tick);
    }
  };

  const queueDrop = (quantity) => {
    const available = MAX_NOTES - notes.size - spawnQueue.length;
    const amount = Math.max(0, Math.min(quantity, available));
    if (!amount) {
      setStatus("纸堆已经很高了，请先清空地面。");
      return;
    }
    const runId = currentRun;
    const currentLevel = landedNotes.length + spawnQueue.length;
    for (let index = 0; index < amount; index += 1) {
      spawnQueue.push({ level: (currentLevel + index) % 112, runId });
    }
    setStatus("正在下落 " + amount + " 张纸……");
    schedule();
  };

  const disturbFloor = (event) => {
    if (!landedNotes.length) return;
    const bounds = stage.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    landedNotes.slice().forEach((paper) => {
      const distance = Math.hypot(paper.x - x, paper.y - y);
      if (distance > 240) return;
      const lift = 1.2 + Math.max(0, (240 - distance) / 240) * 2.3;
      removeFromLanded(paper);
      paper.phase = "falling";
      paper.bounceCount = 0;
      paper.vx += (paper.x - x) * .008;
      paper.vy = -lift;
      paper.vrotation += (Math.random() - .5) * .09;
      paper.bend += 3;
    });
    setStatus("地面被碰了一下，纸张重新找位置。");
    schedule();
  };

  const removeFromLanded = (paper) => {
    const index = landedNotes.indexOf(paper);
    if (index >= 0) landedNotes.splice(index, 1);
  };

  const acceptedFile = (file) => Boolean(file && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 8 * 1024 * 1024);

  const useImage = (file, side) => {
    if (!acceptedFile(file)) {
      setStatus("只接受 8MB 以内的 JPG、PNG 或 WebP 图片。");
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrls.add(url);
    const image = new Image();
    image.onload = () => {
      textures[side] = image;
      drawScene();
      setStatus("图片只保留在当前浏览器中。");
    };
    image.src = url;
    if (side === "front" && previewImage) {
      previewImage.src = url;
      previewImage.hidden = false;
      previewImage.parentElement?.querySelector("span")?.remove();
    }
    if (fileStatus) fileStatus.textContent = side === "front" ? "已加载本地正面图片" : "已加载本地背面图片";
  };

  const setCurrency = (key) => {
    if (!currencies[key]) return;
    selectedCurrency = key;
    document.querySelectorAll("[data-currency]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.currency === key);
    });
    setStatus("下一批纸张使用" + currencies[key].name + "标签。");
  };

  document.querySelectorAll("[data-currency]").forEach((button) => {
    button.addEventListener("click", () => setCurrency(button.dataset.currency));
  });
  document.querySelectorAll("[data-quantity]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-quantity]").forEach((item) => {
        item.classList.toggle("is-selected", item === button);
      });
      queueDrop(Number(button.dataset.quantity) || 1);
    });
  });
  frontInput?.addEventListener("change", () => useImage(frontInput.files?.[0], "front"));
  backInput?.addEventListener("change", () => useImage(backInput.files?.[0], "back"));
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-over");
  });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("is-over"));
  dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-over");
    useImage(event.dataTransfer.files?.[0], "front");
  });
  clearButton.addEventListener("click", () => {
    currentRun += 1;
    spawnQueue.splice(0);
    notes.clear();
    landedNotes.splice(0);
    wind = 0;
    windTarget = 0;
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrameTime = 0;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
    setStatus("地面很干净。");
    drawScene();
  });
  stage.addEventListener("pointermove", (event) => {
    const dx = pointer.x ? event.clientX - pointer.x : 0;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    windTarget = clamp(windTarget + dx * .045, -5, 5);
    if (activeDrops()) schedule();
  }, { passive: true });
  stage.addEventListener("pointerdown", disturbFloor);
  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("beforeunload", () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  resizeCanvas();
})();
