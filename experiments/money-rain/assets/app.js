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
  const COLS = 7;
  const ROWS = 4;
  const PERSPECTIVE = 1050;
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
  let selectedQuantity = 1;
  let currentRun = 0;
  let frameId = 0;
  let lastFrameTime = 0;
  let pixelRatio = 1;
  let wind = 0;
  let windTarget = 0;

  if (!context) return;

  canvas.className = "money-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.moneyCanvas = "true";
  stage.appendChild(canvas);
  floor.hidden = true;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const degrees = (value) => value * Math.PI / 180;
  const setStatus = (message) => {
    if (status) status.textContent = message;
  };
  const stageSize = () => ({
    width: stage.clientWidth,
    height: stage.clientHeight,
    floorHeight: stage.clientHeight * .17
  });

  const createSampleTexture = (currency) => {
    const texture = document.createElement("canvas");
    texture.width = 720;
    texture.height = 405;
    const textureContext = texture.getContext("2d");
    if (!textureContext) return texture;
    textureContext.fillStyle = currency.color;
    textureContext.fillRect(0, 0, texture.width, texture.height);
    textureContext.strokeStyle = "rgba(27, 44, 37, .5)";
    textureContext.lineWidth = 5;
    textureContext.strokeRect(13, 13, texture.width - 26, texture.height - 26);
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

  const imageReady = (image) => Boolean(image && image.complete && image.naturalWidth > 0);
  const currentFrontTexture = () => imageReady(textures.front) ? textures.front : sampleTextures[selectedCurrency];
  const currentBackTexture = () => imageReady(textures.back)
    ? textures.back
    : currentFrontTexture();

  const resizeCanvas = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    notes.forEach((paper) => {
      const size = stageSize();
      paper.targetY = size.height - size.floorHeight - paper.height / 2 - Math.min(paper.level, 110) * 1.55;
      if (paper.phase === "landed") paper.y = paper.targetY;
    });
    drawScene();
  };

  const projectPoint = (paper, u, v) => {
    const localX = (u - .5) * paper.width;
    const localY = (v - .5) * paper.height;
    const centerWave = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    const edge = Math.pow(Math.abs(u - .5) * 2, 2);
    const wave = Math.sin(paper.flutter + u * 5.1 + v * 2.4) * paper.ripple * centerWave;
    const z0 = paper.foldDepth * centerWave + paper.edgeCurl * edge + wave;
    const x0 = localX + Math.sin(v * Math.PI) * paper.bendX * (u - .5) * .42;
    const y0 = localY + Math.sin(u * Math.PI) * paper.bendY * (v - .5) * .28;
    const rotX = degrees(paper.rotX);
    const rotY = degrees(paper.rotY);
    const rotZ = degrees(paper.rotZ);
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const cosZ = Math.cos(rotZ);
    const sinZ = Math.sin(rotZ);
    const x1 = x0 * cosY + z0 * sinY;
    const z1 = -x0 * sinY + z0 * cosY;
    const y2 = y0 * cosX - z1 * sinX;
    const z2 = y0 * sinX + z1 * cosX;
    const x3 = x1 * cosZ - y2 * sinZ;
    const y3 = x1 * sinZ + y2 * cosZ;
    const depth = paper.z + z2;
    const scale = PERSPECTIVE / (PERSPECTIVE - depth);
    return { x: paper.x + x3 * scale, y: paper.y + y3 * scale, depth };
  };

  const drawTexturedTriangle = (texture, source, destination) => {
    const denominator = (source[0].x - source[2].x) * (source[1].y - source[2].y)
      - (source[1].x - source[2].x) * (source[0].y - source[2].y);
    if (Math.abs(denominator) < .001) return;
    const a = ((destination[0].x - destination[2].x) * (source[1].y - source[2].y)
      - (destination[1].x - destination[2].x) * (source[0].y - source[2].y)) / denominator;
    const c = ((destination[1].x - destination[2].x) * (source[0].x - source[2].x)
      - (destination[0].x - destination[2].x) * (source[1].x - source[2].x)) / denominator;
    const e = destination[2].x - a * source[2].x - c * source[2].y;
    const b = ((destination[0].y - destination[2].y) * (source[1].y - source[2].y)
      - (destination[1].y - destination[2].y) * (source[0].y - source[2].y)) / denominator;
    const d = ((destination[1].y - destination[2].y) * (source[0].x - source[2].x)
      - (destination[0].y - destination[2].y) * (source[1].x - source[2].x)) / denominator;
    const f = destination[2].y - b * source[2].x - d * source[2].y;
    context.save();
    context.beginPath();
    context.moveTo(destination[0].x, destination[0].y);
    context.lineTo(destination[1].x, destination[1].y);
    context.lineTo(destination[2].x, destination[2].y);
    context.closePath();
    context.clip();
    context.setTransform(pixelRatio * a, pixelRatio * b, pixelRatio * c, pixelRatio * d, pixelRatio * e, pixelRatio * f);
    context.drawImage(texture, 0, 0);
    context.restore();
  };

  const drawPaperShadow = (paper, size) => {
    const floorTop = size.height - size.floorHeight;
    const distance = Math.max(0, floorTop - paper.y);
    const depthScale = clamp(PERSPECTIVE / (PERSPECTIVE - paper.z), .68, 1.2);
    const shadowScale = clamp(depthScale * (1 - distance / size.height), .35, 1.1);
    context.save();
    context.globalAlpha = clamp(.25 - distance / (size.height * 2.8), .04, .22);
    context.fillStyle = "rgba(45, 47, 43, .8)";
    context.filter = "blur(" + Math.round(8 + distance / 75) + "px)";
    context.beginPath();
    context.ellipse(paper.x, floorTop + 11, paper.width * .35 * shadowScale, 8 * shadowScale, degrees(paper.rotZ), 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const drawPaper = (paper, detail) => {
    const paperCols = detail.cols;
    const paperRows = detail.rows;
    const textureFront = paper.textureFront;
    const textureBack = paper.textureBack;
    const facingBack = Math.cos(degrees(paper.rotX)) * Math.cos(degrees(paper.rotY)) < 0;
    const texture = facingBack ? textureBack : textureFront;
    if (!texture || !imageReady(texture) && !(texture instanceof HTMLCanvasElement)) return;
    const textureWidth = texture.naturalWidth || texture.width;
    const textureHeight = texture.naturalHeight || texture.height;
    const vertices = [];
    for (let row = 0; row <= paperRows; row += 1) {
      const rowVertices = [];
      for (let column = 0; column <= paperCols; column += 1) {
        rowVertices.push(projectPoint(paper, column / paperCols, row / paperRows));
      }
      vertices.push(rowVertices);
    }
    const oldFilter = context.filter;
    context.globalAlpha = clamp(.74 + (paper.z + 140) / 850, .45, .98);
    context.filter = paper.backIsFallback && facingBack ? "brightness(.68) saturate(.78)" : "none";
    for (let row = 0; row < paperRows; row += 1) {
      for (let column = 0; column < paperCols; column += 1) {
        const u0 = column / paperCols;
        const u1 = (column + 1) / paperCols;
        const v0 = row / paperRows;
        const v1 = (row + 1) / paperRows;
        const sourceU0 = facingBack ? 1 - u0 : u0;
        const sourceU1 = facingBack ? 1 - u1 : u1;
        const source = [
          { x: sourceU0 * textureWidth, y: v0 * textureHeight },
          { x: sourceU1 * textureWidth, y: v0 * textureHeight },
          { x: sourceU1 * textureWidth, y: v1 * textureHeight },
          { x: sourceU0 * textureWidth, y: v1 * textureHeight }
        ];
        const topLeft = vertices[row][column];
        const topRight = vertices[row][column + 1];
        const bottomRight = vertices[row + 1][column + 1];
        const bottomLeft = vertices[row + 1][column];
        drawTexturedTriangle(texture, [source[0], source[1], source[2]], [topLeft, topRight, bottomRight]);
        drawTexturedTriangle(texture, [source[0], source[2], source[3]], [topLeft, bottomRight, bottomLeft]);
        const averageDepth = (topLeft.depth + topRight.depth + bottomRight.depth + bottomLeft.depth) / 4;
        const shadeAlpha = clamp(Math.abs(averageDepth) / 240, .015, .12);
        context.save();
        context.beginPath();
        context.moveTo(topLeft.x, topLeft.y);
        context.lineTo(topRight.x, topRight.y);
        context.lineTo(bottomRight.x, bottomRight.y);
        context.lineTo(bottomLeft.x, bottomLeft.y);
        context.closePath();
        context.clip();
        context.fillStyle = averageDepth > 0
          ? "rgba(255, 255, 255, " + shadeAlpha + ")"
          : "rgba(28, 39, 32, " + shadeAlpha + ")";
        context.fill();
        context.restore();
      }
    }
    context.filter = oldFilter;
    context.globalAlpha = 1;
    context.save();
    context.strokeStyle = "rgba(34, 36, 33, .34)";
    context.lineWidth = .9;
    context.beginPath();
    context.moveTo(vertices[0][0].x, vertices[0][0].y);
    for (let column = 1; column <= paperCols; column += 1) context.lineTo(vertices[0][column].x, vertices[0][column].y);
    for (let row = 1; row <= paperRows; row += 1) context.lineTo(vertices[row][paperCols].x, vertices[row][paperCols].y);
    for (let column = paperCols - 1; column >= 0; column -= 1) context.lineTo(vertices[paperRows][column].x, vertices[paperRows][column].y);
    for (let row = paperRows - 1; row >= 0; row -= 1) context.lineTo(vertices[row][0].x, vertices[row][0].y);
    context.closePath();
    context.stroke();
    context.strokeStyle = "rgba(255, 255, 255, .24)";
    context.lineWidth = .8;
    for (let column = 1; column < paperCols; column += 2) {
      context.beginPath();
      context.moveTo(vertices[0][column].x, vertices[0][column].y);
      context.lineTo(vertices[paperRows][column].x, vertices[paperRows][column].y);
      context.stroke();
    }
    if (paper.uploaded) {
      const topLeft = vertices[0][0];
      context.fillStyle = "rgba(255, 255, 255, .7)";
      context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.fillText("LOCAL IMAGE · 本地实验", topLeft.x + 8, topLeft.y + 16);
    }
    context.restore();
  };

  const drawScene = () => {
    const size = stageSize();
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const orderedNotes = Array.from(notes).sort((left, right) => left.level + left.z - right.level - right.z);
    const detail = activeDrops() > 60 ? { cols: 4, rows: 3 } : { cols: COLS, rows: ROWS };
    orderedNotes.forEach((paper) => drawPaperShadow(paper, size));
    orderedNotes.forEach((paper) => drawPaper(paper, detail));
    root.dataset.noteCount = String(notes.size);
    root.dataset.activeDrops = String(activeDrops());
  };

  const removeNote = (paper) => {
    if (paper) notes.delete(paper);
  };

  const removeFromLanded = (paper) => {
    const index = landedNotes.indexOf(paper);
    if (index >= 0) landedNotes.splice(index, 1);
  };

  const trimNotes = () => {
    while (notes.size > MAX_NOTES && landedNotes.length) removeNote(landedNotes.shift());
  };

  const landPaper = (paper) => {
    if (paper.phase === "landed") return;
    paper.phase = "landed";
    paper.y = paper.targetY;
    paper.z = paper.targetZ;
    paper.vx = 0;
    paper.vy = 0;
    paper.vz = 0;
    paper.rotX = (Math.random() - .5) * 10;
    paper.rotY = (Math.random() - .5) * 10;
    paper.rotZ = (Math.random() - .5) * 360;
    paper.vRotX = 0;
    paper.vRotY = 0;
    paper.vRotZ = 0;
    paper.foldDepth = 12 + Math.random() * 16;
    paper.edgeCurl = 8 + Math.random() * 11;
    paper.ripple = 3 + Math.random() * 4;
    paper.bendX *= .45;
    paper.bendY *= .45;
    landedNotes.push(paper);
    trimNotes();
    drawScene();
  };

  const createPaper = (level) => {
    const width = stage.clientWidth < 650 ? 164 : 220;
    const height = width * .5625;
    return {
      level,
      x: 0,
      y: 0,
      z: 0,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      width,
      height,
      vx: 0,
      vy: 0,
      vz: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      vRotX: 0,
      vRotY: 0,
      vRotZ: 0,
      bendX: 0,
      bendY: 0,
      foldDepth: 0,
      edgeCurl: 0,
      ripple: 0,
      flutter: Math.random() * Math.PI * 2,
      bounceCount: 0,
      phase: "falling",
      textureFront: currentFrontTexture(),
      textureBack: currentBackTexture(),
      backIsFallback: !textures.back,
      uploaded: Boolean(textures.front),
      runId: currentRun
    };
  };

  const spawnPaper = (level, runId) => {
    if (runId !== currentRun) return;
    const paper = createPaper(level);
    const size = stageSize();
    const floorTop = size.height - size.floorHeight;
    paper.x = paper.width / 2 + Math.random() * Math.max(1, size.width - paper.width);
    paper.y = -paper.height / 2 - Math.random() * 110;
    paper.z = -150 + Math.random() * 230;
    paper.targetX = paper.width / 2 + Math.random() * Math.max(1, size.width - paper.width);
    paper.targetY = floorTop - paper.height / 2 - Math.min(level, 110) * 1.55;
    paper.targetZ = (level % 9) * 3 + Math.random() * 8;
    paper.vx = (paper.targetX - paper.x) * .002 + (Math.random() - .5) * 1.8;
    paper.vy = Math.random() * .5;
    paper.vz = (Math.random() - .5) * 1.1;
    paper.rotX = (Math.random() - .5) * 52;
    paper.rotY = (Math.random() - .5) * 58;
    paper.rotZ = (Math.random() - .5) * 50;
    paper.vRotX = (Math.random() - .5) * 5.7;
    paper.vRotY = (Math.random() - .5) * 6.8;
    paper.vRotZ = (Math.random() - .5) * 4.2;
    paper.bendX = (Math.random() - .5) * 32;
    paper.bendY = (Math.random() - .5) * 28;
    paper.foldDepth = 24 + Math.random() * 32;
    paper.edgeCurl = 9 + Math.random() * 18;
    paper.ripple = 6 + Math.random() * 9;
    notes.add(paper);
    if (reducedMotion.matches) landPaper(paper);
  };

  const updatePaper = (paper, timeScale) => {
    if (paper.phase === "landed") return;
    const size = stageSize();
    paper.vx += wind * .014 * timeScale;
    paper.vx *= Math.pow(.993, timeScale);
    paper.vy += .2 * timeScale;
    paper.vy *= Math.pow(.998, timeScale);
    paper.vz *= Math.pow(.995, timeScale);
    paper.x += paper.vx * timeScale;
    paper.y += paper.vy * timeScale;
    paper.z += paper.vz * timeScale;
    paper.rotX += paper.vRotX * timeScale;
    paper.rotY += paper.vRotY * timeScale;
    paper.rotZ += paper.vRotZ * timeScale;
    paper.flutter += (.07 + Math.abs(paper.vy) * .01) * timeScale;
    paper.bendX += (Math.sin(paper.flutter) * .22 + wind * .04) * timeScale;
    paper.bendY += Math.cos(paper.flutter * .83) * .18 * timeScale;
    paper.foldDepth += Math.sin(paper.flutter * 1.2) * .12 * timeScale;
    paper.edgeCurl += Math.cos(paper.flutter * .68) * .08 * timeScale;
    paper.vRotX *= Math.pow(.997, timeScale);
    paper.vRotY *= Math.pow(.997, timeScale);
    paper.vRotZ *= Math.pow(.997, timeScale);
    paper.bendX = clamp(paper.bendX, -34, 34);
    paper.bendY = clamp(paper.bendY, -28, 28);
    paper.foldDepth = clamp(paper.foldDepth, 4, 30);
    paper.edgeCurl = clamp(paper.edgeCurl, 2, 20);
    if (paper.x < -paper.width * .45 || paper.x > size.width + paper.width * .45) paper.vx *= -.72;
    if (paper.y >= paper.targetY && paper.vy > 0) {
      paper.y = paper.targetY;
      paper.vy = -Math.abs(paper.vy) * .22;
      paper.vx *= .62;
      paper.vRotX *= .5;
      paper.vRotY *= .5;
      paper.vRotZ *= .5;
      paper.bounceCount += 1;
      if (paper.bounceCount >= 3 || Math.abs(paper.vy) < .85) landPaper(paper);
    }
  };

  const activeDrops = () => Array.from(notes).filter((paper) => paper.phase !== "landed").length + spawnQueue.length;
  const tick = (timestamp) => {
    frameId = 0;
    const timeScale = lastFrameTime ? clamp((timestamp - lastFrameTime) / 16.67, .5, 3) : 1;
    lastFrameTime = timestamp;
    const batchSize = reducedMotion.matches ? spawnQueue.length : 4;
    for (let index = 0; index < batchSize && spawnQueue.length; index += 1) {
      const item = spawnQueue.shift();
      if (item.runId === currentRun) spawnPaper(item.level, item.runId);
    }
    wind += (windTarget - wind) * .06;
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
    if (!notes.size) return;
    const bounds = stage.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    landedNotes.slice().forEach((paper) => {
      const distance = Math.hypot(paper.x - x, paper.y - y);
      if (distance > 240) return;
      removeFromLanded(paper);
      paper.phase = "falling";
      paper.bounceCount = 0;
      paper.vx += (paper.x - x) * .009;
      paper.vy = -1.4 - Math.max(0, (240 - distance) / 240) * 1.8;
      paper.vz += (Math.random() - .5) * 1.5;
      paper.vRotX += (Math.random() - .5) * 4;
      paper.vRotY += (Math.random() - .5) * 4;
      paper.vRotZ += (Math.random() - .5) * 3;
      paper.foldDepth += 3;
    });
    setStatus("地面被碰了一下，纸张重新找位置。");
    schedule();
  };

  const acceptedFile = (file) => file && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 8 * 1024 * 1024;

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
      selectedQuantity = Number(button.dataset.quantity) || 1;
      document.querySelectorAll("[data-quantity]").forEach((item) => {
        item.classList.toggle("is-selected", item === button);
      });
      queueDrop(selectedQuantity);
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
    Array.from(notes).forEach(removeNote);
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
    windTarget = clamp(windTarget + dx * .04, -5, 5);
    if (activeDrops()) schedule();
  }, { passive: true });
  stage.addEventListener("pointerdown", disturbFloor);
  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("beforeunload", () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  resizeCanvas();
})();
