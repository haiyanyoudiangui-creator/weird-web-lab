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
  const VerletEngine = window.VerletJS;
  const Vec2 = window.Vec2;

  if (!root || !stage || !floor || !clearButton || !VerletEngine || !Vec2) return;

  const currencies = {
    cny: { symbol: "¥", denomination: "¥100", name: "人民币", color: "#d9e9b7" },
    usd: { symbol: "$", denomination: "$100", name: "美元", color: "#b9d3e3" },
    eur: { symbol: "€", denomination: "€100", name: "欧元", color: "#d9c7dc" },
    jpy: { symbol: "¥", denomination: "¥1000", name: "日元", color: "#eddaa5" },
    gbp: { symbol: "£", denomination: "£100", name: "英镑", color: "#e7c0af" },
    krw: { symbol: "₩", denomination: "₩10000", name: "韩元", color: "#c8c9e6" }
  };

  const MAX_NOTES = 280;
  const PERSPECTIVE = 980;
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

  const engine = new VerletEngine(1, 1, canvas);
  engine.gravity = new Vec2(0, .2);
  engine.friction = .993;
  engine.groundFriction = .72;

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

  const removeComposite = (paper) => {
    if (!paper.composite) return;
    const index = engine.composites.indexOf(paper.composite);
    if (index >= 0) engine.composites.splice(index, 1);
  };

  const addComposite = (paper) => {
    if (!paper.composite || engine.composites.includes(paper.composite)) return;
    engine.composites.push(paper.composite);
  };

  const moveComposite = (paper, dx, dy) => {
    paper.composite.particles.forEach((particle) => {
      particle.pos.x += dx;
      particle.pos.y += dy;
      particle.lastPos.x += dx;
      particle.lastPos.y += dy;
    });
  };

  const paperCenter = (paper) => {
    let x = 0;
    let y = 0;
    const particles = paper.composite.particles;
    particles.forEach((particle) => {
      x += particle.pos.x;
      y += particle.pos.y;
    });
    return { x: x / particles.length, y: y / particles.length };
  };

  const paperBottom = (paper) => {
    let bottom = -Infinity;
    paper.composite.particles.forEach((particle) => {
      bottom = Math.max(bottom, particle.pos.y);
    });
    return bottom;
  };

  const paperBottomVelocity = (paper) => {
    let velocity = 0;
    const segments = paper.segments;
    for (let column = 0; column < segments; column += 1) {
      const particle = paper.composite.particles[(segments - 1) * segments + column];
      velocity = Math.max(velocity, particle.pos.y - particle.lastPos.y);
    }
    return velocity;
  };

  const targetBottom = (paper, size) => size.floorTop - 2 - Math.min(paper.level, 110) * 1.55;

  const resizeCanvas = () => {
    const size = stageSize();
    const oldFloorTop = previousFloorTop || size.floorTop;
    pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * pixelRatio);
    canvas.height = Math.round(size.height * pixelRatio);
    canvas.style.width = size.width + "px";
    canvas.style.height = size.height + "px";
    engine.width = size.width;
    engine.height = size.floorTop + 1;
    notes.forEach((paper) => {
      if (paper.phase === "landed" && previousFloorTop) {
        const dy = size.floorTop - oldFloorTop;
        moveComposite(paper, 0, dy);
      }
      paper.floorTopAtRest = size.floorTop;
    });
    previousFloorTop = size.floorTop;
    drawScene();
  };

  const projectParticle = (paper, particle, row, column, center) => {
    const localX = particle.pos.x - center.x;
    const localY = particle.pos.y - center.y;
    const faceCos = Math.cos(paper.faceAngle);
    const pseudoDepth = paper.depthBase
      + localX * Math.sin(paper.faceAngle) * .34
      + Math.sin(paper.flutter + row * .9 + column * .7) * paper.ripple;
    const scale = PERSPECTIVE / (PERSPECTIVE - pseudoDepth);
    return {
      x: center.x + localX * faceCos * scale,
      y: center.y + localY * scale + paper.settleLift,
      depth: pseudoDepth
    };
  };

  const buildMesh = (paper) => {
    const center = paperCenter(paper);
    const vertices = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let row = 0; row < paper.segments; row += 1) {
      const rowVertices = [];
      for (let column = 0; column < paper.segments; column += 1) {
        const vertex = projectParticle(
          paper,
          paper.composite.particles[row * paper.segments + column],
          row,
          column,
          center
        );
        rowVertices.push(vertex);
        minX = Math.min(minX, vertex.x);
        maxX = Math.max(maxX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxY = Math.max(maxY, vertex.y);
      }
      vertices.push(rowVertices);
    }
    return {
      paper,
      vertices,
      minX,
      maxX,
      minY,
      maxY,
      facingBack: Math.cos(paper.faceAngle) < 0
    };
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

  const drawPaperShadow = (mesh, size) => {
    const distance = Math.max(0, size.floorTop - mesh.maxY);
    const width = clamp((mesh.maxX - mesh.minX) * .34, 18, 180);
    const depthScale = clamp(PERSPECTIVE / (PERSPECTIVE - mesh.paper.depthBase), .65, 1.15);
    context.save();
    context.globalAlpha = clamp(.22 - distance / (size.height * 3), .035, .2);
    context.fillStyle = "rgba(45, 47, 43, .78)";
    context.filter = "blur(" + Math.round(7 + distance / 85) + "px)";
    context.beginPath();
    context.ellipse((mesh.minX + mesh.maxX) / 2, size.floorTop + 11, width * depthScale, 7 * depthScale, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const drawPaper = (mesh) => {
    const paper = mesh.paper;
    const texture = mesh.facingBack ? paper.textureBack : paper.textureFront;
    if (!imageReady(texture)) return;
    const textureWidth = texture.naturalWidth || texture.width;
    const textureHeight = texture.naturalHeight || texture.height;
    const oldFilter = context.filter;
    context.globalAlpha = clamp(.72 + (paper.depthBase + 140) / 1000, .42, .98);
    context.filter = paper.backIsFallback && mesh.facingBack ? "brightness(.67) saturate(.78)" : "none";
    for (let row = 0; row < paper.segments - 1; row += 1) {
      for (let column = 0; column < paper.segments - 1; column += 1) {
        const u0 = column / (paper.segments - 1);
        const u1 = (column + 1) / (paper.segments - 1);
        const v0 = row / (paper.segments - 1);
        const v1 = (row + 1) / (paper.segments - 1);
        const sourceU0 = mesh.facingBack ? 1 - u0 : u0;
        const sourceU1 = mesh.facingBack ? 1 - u1 : u1;
        const source = [
          { x: sourceU0 * textureWidth, y: v0 * textureHeight },
          { x: sourceU1 * textureWidth, y: v0 * textureHeight },
          { x: sourceU1 * textureWidth, y: v1 * textureHeight },
          { x: sourceU0 * textureWidth, y: v1 * textureHeight }
        ];
        const topLeft = mesh.vertices[row][column];
        const topRight = mesh.vertices[row][column + 1];
        const bottomRight = mesh.vertices[row + 1][column + 1];
        const bottomLeft = mesh.vertices[row + 1][column];
        drawTexturedTriangle(texture, [source[0], source[1], source[2]], [topLeft, topRight, bottomRight]);
        drawTexturedTriangle(texture, [source[0], source[2], source[3]], [topLeft, bottomRight, bottomLeft]);
        const averageDepth = (topLeft.depth + topRight.depth + bottomRight.depth + bottomLeft.depth) / 4;
        const shadeAlpha = clamp(Math.abs(averageDepth - paper.depthBase) / 180, .01, .1);
        context.save();
        context.beginPath();
        context.moveTo(topLeft.x, topLeft.y);
        context.lineTo(topRight.x, topRight.y);
        context.lineTo(bottomRight.x, bottomRight.y);
        context.lineTo(bottomLeft.x, bottomLeft.y);
        context.closePath();
        context.clip();
        context.fillStyle = averageDepth > paper.depthBase
          ? "rgba(255, 255, 255, " + shadeAlpha + ")"
          : "rgba(28, 39, 32, " + shadeAlpha + ")";
        context.fill();
        context.restore();
      }
    }
    context.filter = oldFilter;
    context.globalAlpha = 1;
    context.save();
    context.strokeStyle = "rgba(34, 36, 33, .4)";
    context.lineWidth = .9;
    context.beginPath();
    context.moveTo(mesh.vertices[0][0].x, mesh.vertices[0][0].y);
    for (let column = 1; column < paper.segments; column += 1) {
      context.lineTo(mesh.vertices[0][column].x, mesh.vertices[0][column].y);
    }
    for (let row = 1; row < paper.segments; row += 1) {
      context.lineTo(mesh.vertices[row][paper.segments - 1].x, mesh.vertices[row][paper.segments - 1].y);
    }
    for (let column = paper.segments - 2; column >= 0; column -= 1) {
      context.lineTo(mesh.vertices[paper.segments - 1][column].x, mesh.vertices[paper.segments - 1][column].y);
    }
    for (let row = paper.segments - 2; row > 0; row -= 1) {
      context.lineTo(mesh.vertices[row][0].x, mesh.vertices[row][0].y);
    }
    context.closePath();
    context.stroke();
    context.restore();
  };

  const drawScene = () => {
    const size = stageSize();
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.globalAlpha = 1;
    context.filter = "none";
    context.clearRect(0, 0, size.width, size.height);
    const orderedNotes = Array.from(notes).sort((left, right) => {
      return left.level - right.level || left.depthBase - right.depthBase;
    });
    const meshes = orderedNotes.map(buildMesh);
    meshes.forEach((mesh) => drawPaperShadow(mesh, size));
    meshes.forEach(drawPaper);
    root.dataset.noteCount = String(notes.size);
    root.dataset.activeDrops = String(activeDrops());
  };

  const removeNote = (paper) => {
    removeComposite(paper);
    notes.delete(paper);
  };

  const removeFromLanded = (paper) => {
    const index = landedNotes.indexOf(paper);
    if (index >= 0) landedNotes.splice(index, 1);
  };

  const trimNotes = () => {
    while (notes.size > MAX_NOTES && landedNotes.length) removeNote(landedNotes.shift());
  };

  const normalizeAngle = (angle) => {
    return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  };

  const landPaper = (paper) => {
    if (paper.phase === "landed" || paper.phase === "settling") return;
    const size = stageSize();
    const bottom = paperBottom(paper);
    moveComposite(paper, 0, targetBottom(paper, size) - bottom);
    paper.phase = "settling";
    paper.settleProgress = reducedMotion.matches ? 1 : 0;
    paper.settleLift = 0;
    paper.faceStart = paper.faceAngle;
    paper.faceTarget = Math.cos(paper.faceAngle) >= 0 ? 0 : Math.PI;
    paper.faceDelta = normalizeAngle(paper.faceTarget - paper.faceStart);
    paper.floorTopAtRest = size.floorTop;
    removeComposite(paper);
  };

  const createPaper = (level) => {
    const width = stage.clientWidth < 650 ? 164 : 220;
    const height = width * .5625;
    const segments = notes.size + spawnQueue.length > 60 ? 5 : 6;
    return {
      level,
      width,
      height,
      segments,
      composite: null,
      phase: "falling",
      bounceCount: 0,
      faceAngle: Math.random() * Math.PI * 2,
      faceVelocity: (Math.random() - .5) * .055,
      flutter: Math.random() * Math.PI * 2,
      ripple: 5 + Math.random() * 8,
      depthBase: -120 + Math.random() * 230,
      settleLift: 0,
      targetX: 0,
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
    const startX = paper.width / 2 + Math.random() * Math.max(1, size.width - paper.width);
    const startY = -paper.height / 2 - Math.random() * 115;
    paper.targetX = paper.width / 2 + Math.random() * Math.max(1, size.width - paper.width);
    paper.composite = engine.cloth(new Vec2(startX, startY), paper.width, paper.height, paper.segments, 0, .9);
    const vx = (paper.targetX - startX) * .0011 + (Math.random() - .5) * 1.55;
    const vy = .55 + Math.random() * .7;
    paper.composite.particles.forEach((particle, index) => {
      const column = index % paper.segments;
      const row = Math.floor(index / paper.segments);
      particle.pos.y += Math.sin(column / Math.max(1, paper.segments - 1) * Math.PI) * 2.3;
      particle.lastPos.x = particle.pos.x - vx - (column - row) * .03;
      particle.lastPos.y = particle.pos.y - vy;
    });
    notes.add(paper);
    if (reducedMotion.matches) landPaper(paper);
  };

  const applyAir = (paper, timeScale) => {
    if (paper.phase !== "falling") return;
    const center = paperCenter(paper);
    paper.composite.particles.forEach((particle, index) => {
      const row = Math.floor(index / paper.segments);
      const column = index % paper.segments;
      const localX = (particle.pos.x - center.x) / paper.width;
      const gust = wind * (.008 + Math.abs(localX) * .006) * timeScale;
      const ripple = Math.sin(clock * .12 + row * .8 + column * .65 + paper.flutter) * .018 * timeScale;
      particle.pos.x += gust;
      particle.lastPos.x += gust * .22;
      particle.pos.y += ripple;
    });
    paper.faceVelocity += wind * .00018 * timeScale;
    paper.faceVelocity *= Math.pow(.998, timeScale);
    paper.faceVelocity = clamp(paper.faceVelocity, -.085, .085);
  };

  const enforcePaperFloor = (paper) => {
    if (paper.phase !== "falling") return;
    const size = stageSize();
    const bottom = paperBottom(paper);
    const floor = targetBottom(paper, size);
    if (bottom < floor) return;
    moveComposite(paper, 0, floor - bottom);
    const downwardSpeed = paperBottomVelocity(paper);
    if (paper.bounceCount < 2 && downwardSpeed > 1.15) {
      const rebound = Math.min(4.2, downwardSpeed * .26);
      paper.composite.particles.forEach((particle) => {
        particle.lastPos.y = particle.pos.y + rebound;
      });
      paper.bounceCount += 1;
      return;
    }
    landPaper(paper);
  };

  const updatePaper = (paper, timeScale) => {
    if (paper.phase === "landed") return;
    if (paper.phase === "settling") {
      paper.settleProgress = clamp(paper.settleProgress + timeScale / 16, 0, 1);
      const eased = 1 - Math.pow(1 - paper.settleProgress, 3);
      paper.faceAngle = paper.faceStart + paper.faceDelta * eased;
      paper.settleLift = -Math.sin(Math.PI * paper.settleProgress) * 4;
      if (paper.settleProgress >= 1) {
        paper.phase = "landed";
        paper.settleLift = 0;
        landedNotes.push(paper);
        trimNotes();
      }
      return;
    }
    paper.faceAngle += paper.faceVelocity * timeScale;
    paper.flutter += (.06 + Math.abs(paperBottomVelocity(paper)) * .012) * timeScale;
    paper.ripple = clamp(paper.ripple + Math.sin(clock * .08 + paper.flutter) * .06 * timeScale, 3, 18);
    enforcePaperFloor(paper);
  };

  const activeDrops = () => spawnQueue.length
    + Array.from(notes).filter((paper) => paper.phase !== "landed").length;

  const tick = (timestamp) => {
    frameId = 0;
    const timeScale = lastFrameTime ? clamp((timestamp - lastFrameTime) / 16.67, .5, 3) : 1;
    lastFrameTime = timestamp;
    clock += timeScale;
    const batchSize = reducedMotion.matches ? spawnQueue.length : (activeDrops() > 60 ? 5 : 3);
    for (let index = 0; index < batchSize && spawnQueue.length; index += 1) {
      const item = spawnQueue.shift();
      if (item.runId === currentRun) spawnPaper(item.level, item.runId);
    }
    wind += (windTarget - wind) * .06;
    windTarget *= .94;
    notes.forEach((paper) => applyAir(paper, timeScale));
    if (Array.from(notes).some((paper) => paper.phase === "falling")) {
      engine.frame(activeDrops() > 60 ? 7 : 10);
    }
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
      const center = paperCenter(paper);
      const distance = Math.hypot(center.x - x, center.y - y);
      if (distance > 250) return;
      removeFromLanded(paper);
      paper.phase = "falling";
      paper.bounceCount = 0;
      addComposite(paper);
      const kickX = (center.x - x) * .012 + (Math.random() - .5) * 1.2;
      const kickY = 1.6 + Math.max(0, (250 - distance) / 250) * 2.3;
      paper.composite.particles.forEach((particle) => {
        particle.lastPos.x = particle.pos.x - kickX;
        particle.lastPos.y = particle.pos.y + kickY;
      });
    });
    setStatus("地面被碰了一下，纸张重新找位置。");
    schedule();
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
    engine.composites.splice(0);
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
