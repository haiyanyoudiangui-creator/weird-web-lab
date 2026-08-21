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
    cny: { symbol: "¥", denomination: "¥100", name: "人民币", color: "cny" },
    usd: { symbol: "$", denomination: "$100", name: "美元", color: "usd" },
    eur: { symbol: "€", denomination: "€100", name: "欧元", color: "eur" },
    jpy: { symbol: "¥", denomination: "¥1000", name: "日元", color: "jpy" },
    gbp: { symbol: "£", denomination: "£100", name: "英镑", color: "gbp" },
    krw: { symbol: "₩", denomination: "₩10000", name: "韩元", color: "krw" }
  };
  const currencyKeys = Object.keys(currencies);
  const MAX_NOTES = 280;
  const PAPER_SEGMENTS = 5;
  const notes = new Set();
  const landedNotes = [];
  const spawnQueue = [];
  const imageUrls = { front: "", back: "" };
  const objectUrls = new Set();
  const pointer = { x: 0, y: 0, lastX: 0, lastY: 0 };
  let selectedCurrency = "cny";
  let selectedQuantity = 1;
  let currentRun = 0;
  let frameId = 0;
  let wind = 0;
  let windTarget = 0;

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const stageSize = () => ({
    width: stage.clientWidth,
    height: stage.clientHeight,
    floorHeight: stage.clientHeight * .17
  });

  const removeNote = (note) => {
    if (!note) return;
    notes.delete(note);
    note.element.remove();
    note.shadow.remove();
  };

  const removeFromLanded = (note) => {
    const index = landedNotes.indexOf(note);
    if (index >= 0) landedNotes.splice(index, 1);
  };

  const trimNotes = () => {
    while (notes.size > MAX_NOTES && landedNotes.length) {
      removeNote(landedNotes.shift());
    }
  };

  const createSampleFace = (currency) => {
    const face = document.createElement("div");
    face.className = "sample-face";
    face.innerHTML = [
      "<span class=\"sample-word\">SAMPLE / 样票</span>",
      "<strong class=\"sample-number\">" + currency.denomination + "</strong>",
      "<span class=\"sample-symbol\">" + currency.symbol + "</span>",
      "<span class=\"sample-copy\">非法定货币 · 仅作视觉效果</span>"
    ].join("");
    return face;
  };

  const createPaperFace = (side, currency, imageUrl) => {
    const face = document.createElement("div");
    face.className = "paper-face " + side;
    for (let index = 0; index < PAPER_SEGMENTS; index += 1) {
      const strip = document.createElement("div");
      strip.className = "paper-strip";
      strip.dataset.segment = String(index);
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = "";
        image.draggable = false;
        image.style.left = (-index * 100) + "%";
        strip.appendChild(image);
      } else {
        const sample = createSampleFace(currency);
        sample.style.left = (-index * 100) + "%";
        strip.appendChild(sample);
      }
      face.appendChild(strip);
    }
    return face;
  };

  const createPaper = (level) => {
    const currency = currencies[selectedCurrency];
    const element = document.createElement("div");
    const shadow = document.createElement("div");
    const front = createPaperFace("front", currency, imageUrls.front);
    const back = createPaperFace("back", currency, imageUrls.back || imageUrls.front);

    element.className = "paper-note currency-" + currency.color + (imageUrls.back ? " has-back" : "");
    element.setAttribute("aria-hidden", "true");
    shadow.className = "paper-shadow";
    element.appendChild(front);
    element.appendChild(back);
    floor.appendChild(shadow);
    floor.appendChild(element);

    return {
      element,
      shadow,
      level,
      x: 0,
      y: 0,
      z: 0,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      vrx: 0,
      vry: 0,
      vrz: 0,
      foldY: 0,
      foldX: 0,
      foldVelocityY: 0,
      foldVelocityX: 0,
      flutter: Math.random() * Math.PI * 2,
      strips: Array.from(element.querySelectorAll(".paper-strip")),
      bounceCount: 0,
      phase: "falling",
      runId: currentRun
    };
  };

  const renderPaper = (paper) => {
    const size = stageSize();
    const scale = Math.max(.66, Math.min(1.12, .82 + (paper.z + 180) / 720));
    const shadowScale = Math.max(.5, Math.min(1.15, scale * (1 - Math.abs(paper.z) / 800)));
    const shadowY = size.height - size.floorHeight + 9;
    paper.element.style.zIndex = String(10 + Math.max(0, Math.round(paper.z + paper.level)));
    paper.element.dataset.phase = paper.phase;
    paper.element.style.transform = "translate3d(" + paper.x.toFixed(1) + "px, " + paper.y.toFixed(1) + "px, " + paper.z.toFixed(1) + "px) rotateX(" + paper.rx.toFixed(2) + "deg) rotateY(" + paper.ry.toFixed(2) + "deg) rotateZ(" + paper.rz.toFixed(2) + "deg) scale(" + scale.toFixed(3) + ")";
    const noteWidth = paper.element.offsetWidth || 212;
    paper.shadow.style.width = noteWidth * shadowScale + "px";
    paper.shadow.style.transform = "translate3d(" + (paper.x + noteWidth * (1 - shadowScale) / 2).toFixed(1) + "px, " + shadowY.toFixed(1) + "px, 0) rotate(" + paper.rz.toFixed(2) + "deg) scaleY(" + Math.max(.35, shadowScale * .7).toFixed(3) + ")";
    paper.shadow.style.opacity = String(Math.max(.08, Math.min(.3, .22 * shadowScale * (1 - Math.min(.55, Math.abs(paper.y - (size.height - size.floorHeight)) / size.height)))));
    const center = (PAPER_SEGMENTS - 1) / 2;
    paper.strips.forEach((strip, index) => {
      const across = (index % PAPER_SEGMENTS) - center;
      const yaw = across * paper.foldY;
      const pitch = Math.sin((index % PAPER_SEGMENTS) / (PAPER_SEGMENTS - 1) * Math.PI) * paper.foldX;
      const lift = Math.abs(yaw) * .42;
      strip.style.transform = "translateZ(" + lift.toFixed(2) + "px) rotateY(" + yaw.toFixed(2) + "deg) rotateX(" + pitch.toFixed(2) + "deg)";
    });
  };

  const landPaper = (paper) => {
    if (paper.phase === "landed") return;
    paper.phase = "landed";
    paper.y = paper.targetY;
    paper.z = paper.targetZ;
    paper.vx = 0;
    paper.vy = 0;
    paper.vz = 0;
    paper.vrx = 0;
    paper.vry = 0;
    paper.vrz = 0;
    paper.foldY *= .35;
    paper.foldX *= .35;
    paper.foldVelocityY = 0;
    paper.foldVelocityX = 0;
    landedNotes.push(paper);
    trimNotes();
    renderPaper(paper);
  };

  const spawnPaper = (level, runId) => {
    if (runId !== currentRun) return;
    const paper = createPaper(level);
    const size = stageSize();
    const noteWidth = paper.element.offsetWidth || 212;
    const noteHeight = paper.element.offsetHeight || 120;
    const floorTop = size.height - size.floorHeight;
    paper.x = Math.max(8, Math.random() * Math.max(12, size.width - noteWidth - 16));
    paper.y = -noteHeight - Math.random() * 90;
    paper.z = -120 + Math.random() * 180;
    paper.targetX = Math.max(8, Math.random() * Math.max(12, size.width - noteWidth - 16));
    paper.targetY = floorTop - noteHeight - Math.min(level, 110) * 1.55;
    paper.targetZ = (level % 9) * 3 + Math.random() * 8;
    paper.vx = (Math.random() - .5) * 1.4;
    paper.vy = Math.random() * .6;
    paper.vz = (Math.random() - .5) * .85;
    paper.rx = (Math.random() - .5) * 35;
    paper.ry = (Math.random() - .5) * 35;
    paper.rz = (Math.random() - .5) * 34;
    paper.vrx = (Math.random() - .5) * 4.5;
    paper.vry = (Math.random() - .5) * 5.2;
    paper.vrz = (Math.random() - .5) * 3.5;
    paper.foldY = (Math.random() - .5) * 16;
    paper.foldX = (Math.random() - .5) * 10;
    paper.foldVelocityY = (Math.random() - .5) * 1.8;
    paper.foldVelocityX = (Math.random() - .5) * 1.2;
    notes.add(paper);
    renderPaper(paper);
    if (reducedMotion.matches) landPaper(paper);
  };

  const updatePaper = (paper) => {
    if (paper.phase === "landed") return;
    const size = stageSize();
    paper.vx += wind * .012;
    paper.vx *= .994;
    paper.vy += .18;
    paper.vy *= .998;
    paper.vz *= .995;
    paper.x += paper.vx;
    paper.y += paper.vy;
    paper.z += paper.vz;
    paper.rx += paper.vrx;
    paper.ry += paper.vry;
    paper.rz += paper.vrz;
    paper.flutter += .06 + Math.abs(paper.vy) * .008;
    paper.foldVelocityY += Math.sin(paper.flutter) * .035 + wind * .004;
    paper.foldVelocityX += Math.cos(paper.flutter * .83) * .025;
    paper.foldVelocityY *= .96;
    paper.foldVelocityX *= .96;
    paper.foldY += paper.foldVelocityY;
    paper.foldX += paper.foldVelocityX;
    paper.foldY = Math.max(-24, Math.min(24, paper.foldY));
    paper.foldX = Math.max(-15, Math.min(15, paper.foldX));
    paper.vrx *= .997;
    paper.vry *= .997;
    paper.vrz *= .997;

    if (paper.x < -80 || paper.x > size.width - 40) paper.vx *= -.72;
    if (paper.y >= paper.targetY && paper.vy > 0) {
      paper.y = paper.targetY;
      paper.vy = -Math.abs(paper.vy) * .2;
      paper.vx *= .6;
      paper.vrx *= .48;
      paper.vry *= .48;
      paper.vrz *= .48;
      paper.bounceCount += 1;
      if (paper.bounceCount >= 3 || Math.abs(paper.vy) < .8) landPaper(paper);
    }
    renderPaper(paper);
  };

  const tick = () => {
    frameId = 0;
    const batchSize = reducedMotion.matches ? spawnQueue.length : 4;
    for (let index = 0; index < batchSize && spawnQueue.length; index += 1) {
      const item = spawnQueue.shift();
      if (item.runId === currentRun) spawnPaper(item.level, item.runId);
    }
    wind += (windTarget - wind) * .06;
    windTarget *= .94;
    notes.forEach(updatePaper);
    if (spawnQueue.length || Array.from(notes).some((paper) => paper.phase !== "landed")) {
      frameId = window.requestAnimationFrame(tick);
    } else if (activeDrops() === 0) {
      setStatus("地面已有 " + landedNotes.length + " 张样票。");
    }
  };

  const activeDrops = () => Array.from(notes).filter((paper) => paper.phase !== "landed").length + spawnQueue.length;
  const schedule = () => {
    if (!frameId) frameId = window.requestAnimationFrame(tick);
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
      if (distance > 230) return;
      removeFromLanded(paper);
      paper.phase = "falling";
      paper.bounceCount = 0;
      paper.vx += (paper.x - x) * .008;
      paper.vy = -1.2 - Math.max(0, (230 - distance) / 230) * 1.5;
      paper.vz += (Math.random() - .5) * 1.5;
      paper.vrz += (Math.random() - .5) * 3;
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
    imageUrls[side] = URL.createObjectURL(file);
    objectUrls.add(imageUrls[side]);
    if (side === "front" && previewImage) {
      previewImage.src = imageUrls.front;
      previewImage.hidden = false;
      previewImage.parentElement?.querySelector("span")?.remove();
    }
    if (fileStatus) fileStatus.textContent = side === "front" ? "已加载本地正面图片" : "已加载本地背面图片";
    setStatus("图片只保留在当前浏览器中。");
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
    setStatus("地面很干净。");
  });
  stage.addEventListener("pointermove", (event) => {
    const dx = pointer.x ? event.clientX - pointer.x : 0;
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    windTarget = Math.max(-4, Math.min(4, windTarget + dx * .035));
    if (activeDrops()) schedule();
  }, { passive: true });
  stage.addEventListener("pointerdown", disturbFloor);
  window.addEventListener("resize", () => {
    notes.forEach((paper) => {
      const size = stageSize();
      const noteHeight = paper.element.offsetHeight || 120;
      paper.targetY = size.height - size.floorHeight - noteHeight - Math.min(paper.level, 110) * 1.55;
      if (paper.phase === "landed") paper.y = paper.targetY;
      renderPaper(paper);
    });
  }, { passive: true });

  window.addEventListener("beforeunload", () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  });
})();
