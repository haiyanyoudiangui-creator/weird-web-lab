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

  const colors = ["#bbff65", "#78ddff", "#ff75b9", "#a18cff"];
  const messages = [
    ["它突然意识到自己正在被观察。", "AWARE"],
    ["它说自己只是一个普通的网页。", "LYING"],
    ["它把你的光标登记成了新样本。", "NOTED"],
    ["它想往左走，但暂时没有腿。", "NO LEGS"],
    ["它开始怀疑实验室到底是谁的。", "UNCERTAIN"]
  ];
  const particles = [];
  const ripples = [];
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight * .4 };
  const smoothPointer = { x: pointer.x, y: pointer.y };
  let width = window.innerWidth;
  let height = window.innerHeight;
  let pixelRatio = 1;
  let animationFrame = 0;
  let lastTrail = 0;
  let messageIndex = -1;

  const resizeCanvas = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const limitParticles = () => {
    const maximum = width < 700 ? 36 : 78;
    while (particles.length > maximum) particles.shift();
  };

  const addParticles = (x, y, amount = 1, force = 1) => {
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 1.5 + .35) * force;
      particles.push({
        x: x + (Math.random() - .5) * 12,
        y: y + (Math.random() - .5) * 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: Math.random() * .018 + .012,
        size: Math.random() * 2.8 + 1,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    limitParticles();
  };

  const addRipple = (x, y) => {
    ripples.push({ x, y, radius: 8, life: 1 });
    while (ripples.length > 5) ripples.shift();
  };

  const updateCore = () => {
    if (!stage || !core || reducedMotion.matches) return;
    const bounds = stage.getBoundingClientRect();
    const relativeX = (pointer.x - (bounds.left + bounds.width / 2)) / bounds.width;
    const relativeY = (pointer.y - (bounds.top + bounds.height / 2)) / bounds.height;
    const shiftX = Math.max(-18, Math.min(18, relativeX * 34));
    const shiftY = Math.max(-18, Math.min(18, relativeY * 34));
    core.style.setProperty("--core-shift-x", shiftX.toFixed(1) + "px");
    core.style.setProperty("--core-shift-y", shiftY.toFixed(1) + "px");
    core.style.setProperty("--eye-x", (relativeX * 8).toFixed(1) + "px");
    core.style.setProperty("--eye-y", (relativeY * 7).toFixed(1) + "px");
  };

  const updateCard = () => {
    if (!card || reducedMotion.matches) return;
    const bounds = card.getBoundingClientRect();
    const inside = pointer.x >= bounds.left && pointer.x <= bounds.right
      && pointer.y >= bounds.top && pointer.y <= bounds.bottom;
    if (!inside) {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
      card.style.setProperty("--card-x", "50%");
      card.style.setProperty("--card-y", "50%");
      return;
    }
    const relativeX = (pointer.x - bounds.left) / bounds.width;
    const relativeY = (pointer.y - bounds.top) / bounds.height;
    card.style.setProperty("--tilt-x", ((.5 - relativeY) * 4).toFixed(2) + "deg");
    card.style.setProperty("--tilt-y", ((relativeX - .5) * 4).toFixed(2) + "deg");
    card.style.setProperty("--card-x", (relativeX * 100).toFixed(1) + "%");
    card.style.setProperty("--card-y", (relativeY * 100).toFixed(1) + "%");
  };

  const draw = () => {
    animationFrame = 0;
    smoothPointer.x += (pointer.x - smoothPointer.x) * .12;
    smoothPointer.y += (pointer.y - smoothPointer.y) * .12;
    context.clearRect(0, 0, width, height);
    const aura = context.createRadialGradient(smoothPointer.x, smoothPointer.y, 0, smoothPointer.x, smoothPointer.y, 130);
    aura.addColorStop(0, "rgba(187, 255, 101, .1)");
    aura.addColorStop(1, "rgba(187, 255, 101, 0)");
    context.fillStyle = aura;
    context.fillRect(smoothPointer.x - 130, smoothPointer.y - 130, 260, 260);

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= .985;
      particle.vy *= .985;
      particle.life -= particle.decay;
      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }
      context.globalAlpha = Math.max(0, particle.life) * .8;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
      context.fill();
    }

    for (let index = ripples.length - 1; index >= 0; index -= 1) {
      const ripple = ripples[index];
      ripple.radius += 2.6;
      ripple.life -= .03;
      if (ripple.life <= 0) {
        ripples.splice(index, 1);
        continue;
      }
      context.globalAlpha = ripple.life * .55;
      context.strokeStyle = index % 2 ? "#78ddff" : "#ff75b9";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      context.stroke();
    }

    context.globalAlpha = 1;
    updateCore();
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
    if (lens) lens.style.transform = "translate3d(" + pointer.x + "px, " + pointer.y + "px, 0)";
    if (!reducedMotion.matches && distance > 9 && event.timeStamp - lastTrail > 34) {
      addParticles(pointer.x, pointer.y, Math.min(3, Math.ceil(distance / 35)));
      lastTrail = event.timeStamp;
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
      addParticles(x, y, 24, 2.2);
      addRipple(x, y);
      scheduleDraw();
    }
    if (disturbButton) disturbButton.innerHTML = "再扰动一次 <span aria-hidden=\"true\">✦</span>";
    window.setTimeout(() => {
      if (stage) stage.dataset.state = "normal";
    }, 1200);
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
    addParticles(width * .5, height * .4, width < 700 ? 16 : 28, .7);
    scheduleDraw();
  }
})();
