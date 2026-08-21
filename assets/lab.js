(() => {
  const root = document.querySelector("[data-weird-lab]");
  const glow = document.querySelector("[data-cursor-glow]");
  const card = document.querySelector("[data-lab-card]");
  const button = document.querySelector("[data-whisper-button]");
  const whisper = document.querySelector("[data-whisper]");
  const finePointer = window.matchMedia("(pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!root) return;

  let frame = 0;
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight * 0.2;

  const resetCard = () => {
    if (!card) return;
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
    card.style.setProperty("--spot-x", "50%");
    card.style.setProperty("--spot-y", "50%");
  };

  const renderPointer = () => {
    frame = 0;
    root.style.setProperty("--cursor-x", `${pointerX}px`);
    root.style.setProperty("--cursor-y", `${pointerY}px`);

    if (glow) {
      glow.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0)`;
    }

    if (!card || reducedMotion.matches) return;

    const bounds = card.getBoundingClientRect();
    const inside = pointerX >= bounds.left && pointerX <= bounds.right
      && pointerY >= bounds.top && pointerY <= bounds.bottom;

    if (!inside) {
      resetCard();
      return;
    }

    const relativeX = (pointerX - bounds.left) / bounds.width;
    const relativeY = (pointerY - bounds.top) / bounds.height;
    const tiltX = (0.5 - relativeY) * 5;
    const tiltY = (relativeX - 0.5) * 5;
    card.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
    card.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
    card.style.setProperty("--spot-x", `${(relativeX * 100).toFixed(1)}%`);
    card.style.setProperty("--spot-y", `${(relativeY * 100).toFixed(1)}%`);
  };

  const handlePointerMove = (event) => {
    if (!finePointer.matches) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!frame) frame = window.requestAnimationFrame(renderPointer);
  };

  document.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("blur", resetCard);
  card?.addEventListener("pointerleave", resetCard);

  const ideas = [
    "一个会嫉妒计算器的计算器。",
    "只能在凌晨打开、会忘记路线的地图。",
    "给未来的自己写一封会动的信。",
    "一个每次刷新都改变性格的天气预报。",
    "让网页决定今天该相信哪一个念头。",
    "一场观众不知道自己正在参加的比赛。",
    "一个把犹豫可视化成天气的按钮。"
  ];

  button?.addEventListener("click", () => {
    if (!whisper) return;
    const current = whisper.textContent;
    let next = ideas[Math.floor(Math.random() * ideas.length)];
    while (ideas.length > 1 && next === current) {
      next = ideas[Math.floor(Math.random() * ideas.length)];
    }
    whisper.textContent = next;
  });
})();
