(() => {
  const root = document.querySelector("[data-money-lab]");
  const stage = document.querySelector("[data-money-stage]");
  const floor = document.querySelector("[data-money-floor]");
  const preview = document.querySelector("[data-preview]");
  const previewDenomination = document.querySelector("[data-preview-denomination]");
  const previewSymbol = document.querySelector(".preview-symbol");
  const dropButton = document.querySelector("[data-drop-money]");
  const clearButton = document.querySelector("[data-clear-floor]");
  const status = document.querySelector("[data-stage-status]");

  if (!root || !stage || !floor || !preview || !dropButton || !clearButton) return;

  const currencies = {
    cny: { symbol: "¥", denomination: "¥100" },
    usd: { symbol: "$", denomination: "$100" },
    eur: { symbol: "€", denomination: "€100" },
    jpy: { symbol: "¥", denomination: "¥1000" },
    gbp: { symbol: "£", denomination: "£100" },
    krw: { symbol: "₩", denomination: "₩10000" }
  };
  const currencyNames = {
    cny: "人民币",
    usd: "美元",
    eur: "欧元",
    jpy: "日元",
    gbp: "英镑",
    krw: "韩元"
  };
  const currencyKeys = Object.keys(currencies);
  const landedNotes = [];
  let selectedCurrency = "cny";
  let selectedQuantity = 1;
  let activeDrops = 0;
  let nextLevel = 0;
  let dropRun = 0;

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const updatePreview = () => {
    const currency = currencies[selectedCurrency];
    currencyKeys.forEach((key) => preview.classList.remove("currency-" + key));
    preview.classList.add("currency-" + selectedCurrency);
    if (previewDenomination) previewDenomination.textContent = currency.denomination;
    if (previewSymbol) previewSymbol.textContent = currency.symbol;
  };

  const updateSelectedButtons = () => {
    document.querySelectorAll("[data-currency]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.currency === selectedCurrency);
    });
    document.querySelectorAll("[data-quantity]").forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.quantity) === selectedQuantity);
    });
  };

  const makeNote = () => {
    const currency = currencies[selectedCurrency];
    const note = document.createElement("div");
    note.className = "money-note currency-" + selectedCurrency;
    note.setAttribute("aria-hidden", "true");
    note.innerHTML = [
      "<span class=\"note-word\">样票 / SAMPLE</span>",
      "<strong class=\"note-denomination\">" + currency.denomination + "</strong>",
      "<span class=\"note-symbol\">" + currency.symbol + "</span>",
      "<span class=\"note-copy\">非法定货币</span>",
      "<span class=\"note-line\"></span>"
    ].join("");
    return note;
  };

  const trimNotes = () => {
    while (landedNotes.length > 260) {
      const oldest = landedNotes.shift();
      oldest?.remove();
    }
  };

  const dropNote = (level, delay, runId) => {
    window.setTimeout(() => {
      if (runId !== dropRun) return;
      const note = makeNote();
      floor.appendChild(note);
      const noteWidth = note.offsetWidth || 176;
      const noteHeight = note.offsetHeight || 96;
      const stageWidth = stage.clientWidth;
      const stageHeight = stage.clientHeight;
      const startX = Math.max(8, Math.random() * Math.max(12, stageWidth - noteWidth - 16));
      const targetX = Math.max(8, Math.random() * Math.max(12, stageWidth - noteWidth - 16));
      const startY = -noteHeight - Math.random() * 120;
      const targetY = stageHeight - noteHeight - 18 - level * 1.55;
      const startRotation = (Math.random() - .5) * 34;
      const targetRotation = (Math.random() - .5) * 24;
      const duration = 720 + Math.random() * 420;
      const startedAt = performance.now();
      activeDrops += 1;
      note.style.transform = "translate3d(" + startX + "px, " + startY + "px, 0) rotate(" + startRotation + "deg)";

      const animate = (now) => {
        if (runId !== dropRun) {
          note.remove();
          return;
        }
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const bounce = progress > .78 ? Math.sin((progress - .78) / .22 * Math.PI) * 7 * (1 - progress) : 0;
        const x = startX + (targetX - startX) * eased;
        const y = startY + (targetY - startY) * eased - bounce;
        const rotation = startRotation + (targetRotation - startRotation) * eased;
        note.style.transform = "translate3d(" + x.toFixed(1) + "px, " + y.toFixed(1) + "px, 0) rotate(" + rotation.toFixed(2) + "deg)";
        if (progress < 1) {
          window.requestAnimationFrame(animate);
          return;
        }
        note.classList.add("is-landed");
        landedNotes.push(note);
        activeDrops -= 1;
        trimNotes();
        setStatus(activeDrops ? "还有纸钞正在下落……" : "地面已有 " + landedNotes.length + " 张样票。");
      };

      window.requestAnimationFrame(animate);
    }, delay);
  };

  const dropMoney = () => {
    preview.classList.add("is-hidden");
    setStatus("正在下落 " + selectedQuantity + " 张" + currencyNames[selectedCurrency] + "样票……");
    for (let index = 0; index < selectedQuantity; index += 1) {
      const level = nextLevel % 92;
      nextLevel += 1;
      dropNote(level, index * 14, dropRun);
    }
  };

  document.querySelectorAll("[data-currency]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCurrency = button.dataset.currency || "cny";
      updateSelectedButtons();
      updatePreview();
      setStatus("预览已换成" + currencyNames[selectedCurrency] + "样票。");
    });
  });

  document.querySelectorAll("[data-quantity]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedQuantity = Number(button.dataset.quantity) || 1;
      updateSelectedButtons();
      setStatus("下一次会掉落 " + selectedQuantity + " 张。");
    });
  });

  dropButton.addEventListener("click", dropMoney);
  clearButton.addEventListener("click", () => {
    dropRun += 1;
    activeDrops = 0;
    landedNotes.splice(0).forEach((note) => note.remove());
    floor.querySelectorAll(".money-note").forEach((note) => note.remove());
    nextLevel = 0;
    preview.classList.remove("is-hidden");
    setStatus("地面很干净。");
  });

  updateSelectedButtons();
  updatePreview();
})();
