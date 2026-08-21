(() => {
  const root = document.querySelector("[data-weird-lab]");
  const canvas = document.querySelector("[data-lab-canvas]");
  const lens = document.querySelector("[data-cursor-lens]");
  const stage = document.querySelector("[data-lab-stage]");
  const core = document.querySelector("[data-lab-core]");
  const mood = document.querySelector("[data-mood]");
  const coreWord = document.querySelector("[data-core-word]");
  const disturbButton = document.querySelector("[data-disturb]");
  const card = document.querySelector("[data-lab-card]");
  const finePointer = window.matchMedia("(pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!root || !canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const colors = ["#d85d4c", "#526fa7", "#e7b64d", "#7c956e"];
  const messages = [
    ["它突然意识到自己正在被观察。", "它有点紧张"],
    ["它说自己只是一个普通的网页。", "它在撒谎"],
    ["它把你的光标登记成了新样本。", "已记录"],
    ["它想往左走，但暂时没有腿。", "没有腿"],
    ["它开始怀疑实验室到底是谁的。", "想不明白"]
  ];
  const pieces = [];
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight * .4 };
  let width = window.innerWidth;
  let height = window.innerHeight;
  let pixelRatio = 1;
  let animationFrame = 0;
  let lastPiece = 0;
  let messageIndex = -1;

  const resizeCanvas = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const addPieces = (x, y, amount = 1, force = 1) => {
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 1.3 + .35) * force;
      pieces.push({
        x: x + (Math.random() - .5) * 9,
        y: y + (Math.random() - .5) * 9,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - .4,
        life: 1,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - .5) * .08,
        size: Math.random() * 4 + 3,
        shape: Math.random() > .5 ? "square" : "dot",
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    while (pieces.length > (width < 700 ? 30 : 55)) pieces.shift();
  };

  const updateStage = () => {
    if (!stage || !core || reducedMotion.matches) return;
    const bounds = stage.getBoundingClientRect();
    const relativeX = (pointer.x - (bounds.left + bounds.width / 2)) / bounds.width;
    const relativeY = (pointer.y - (bounds.top + bounds.height / 2)) / bounds.height;
    const thingX = Math.max(-18, Math.min(18, relativeX * 34));
    const thingY = Math.max(-14, Math.min(14, relativeY * 28));
    core.style.setProperty("--thing-x", thingX.toFixed(1) + "px");
    core.style.setProperty("--thing-y", thingY.toFixed(1) + "px");
    core.style.setProperty("--eye-x", (relativeX * 7).toFixed(1) + "px");
    core.style.setProperty("--eye-y", (relativeY * 6).toFixed(1) + "px");
  };

  const updateCard = () => {
    if (!card || reducedMotion.matches) return;
    const bounds = card.getBoundingClientRect();
    const inside = pointer.x >= bounds.left && pointer.x <= bounds.right
      && pointer.y >= bounds.top && pointer.y <= bounds.bottom;
    if (!inside) {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
      return;
    }
    const relativeX = (pointer.x - bounds.left) / bounds.width;
    const relativeY = (pointer.y - bounds.top) / bounds.height;
    card.style.setProperty("--tilt-x", ((.5 - relativeY) * 1.2).toFixed(2) + "deg");
    card.style.setProperty("--tilt-y", ((relativeX - .5) * 1.2).toFixed(2) + "deg");
  };

  const drawPiece = (piece) => {
    context.save();
    context.translate(piece.x, piece.y);
    context.rotate(piece.rotation);
    context.globalAlpha = Math.max(0, piece.life) * .7;
    context.fillStyle = piece.color;
    if (piece.shape === "dot") {
      context.beginPath();
      context.arc(0, 0, piece.size * .55, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * .65);
    }
    context.restore();
  };

  const draw = () => {
    animationFrame = 0;
    context.clearRect(0, 0, width, height);
    for (let index = pieces.length - 1; index >= 0; index -= 1) {
      const piece = pieces[index];
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.vy += .018;
      piece.vx *= .989;
      piece.rotation += piece.spin;
      piece.life -= .015;
      if (piece.life <= 0) {
        pieces.splice(index, 1);
        continue;
      }
      drawPiece(piece);
    }
    context.globalAlpha = 1;
    updateStage();
    updateCard();
    if (!reducedMotion.matches) animationFrame = window.requestAnimationFrame(draw);
  };

  const scheduleDraw = () => {
    if (!animationFrame && !reducedMotion.matches) animationFrame = window.requestAnimationFrame(draw);
  };

  const handlePointerMove = (event) => {
    if (!finePointer.matches) return;
    const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    root.style.setProperty("--pointer-x", pointer.x + "px");
    root.style.setProperty("--pointer-y", pointer.y + "px");
    if (lens) lens.style.transform = "translate3d(" + pointer.x + "px, " + pointer.y + "px, 0) rotate(12deg)";
    if (!reducedMotion.matches && distance > 13 && event.timeStamp - lastPiece > 60) {
      addPieces(pointer.x, pointer.y, Math.min(2, Math.ceil(distance / 50)));
      lastPiece = event.timeStamp;
    }
    scheduleDraw();
  };

  const setMood = () => {
    if (!mood || !coreWord) return;
    messageIndex = (messageIndex + 1) % messages.length;
    mood.textContent = messages[messageIndex][0];
    coreWord.textContent = messages[messageIndex][1];
  };

  const disturb = (x, y) => {
    setMood();
    if (stage) stage.dataset.state = "startled";
    if (!reducedMotion.matches) {
      addPieces(x, y, 13, 1.8);
      scheduleDraw();
    }
    if (disturbButton) disturbButton.innerHTML = "再戳一下 <span aria-hidden=\"true\">↗</span>";
    window.setTimeout(() => {
      if (stage) stage.dataset.state = "normal";
    }, 850);
  };

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive: true });
  document.addEventListener("pointermove", handlePointerMove, { passive: true });
  disturbButton?.addEventListener("click", () => disturb(pointer.x, pointer.y));
  stage?.addEventListener("click", (event) => {
    if (event.target.closest("button, a")) return;
    disturb(event.clientX, event.clientY);
  });
  card?.addEventListener("pointerleave", () => {
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
  });

  if (!reducedMotion.matches) {
    addPieces(width * .5, height * .38, width < 700 ? 7 : 13, .55);
    scheduleDraw();
  }
})();
