// app.js (instant win fixes: win recognition + snap at 75% + wheel labels)
const STORE_KEY = "compot_data_v1";

const defaultData = {
  user: { name: "John Smith", email: "john@example.com" },
  balance: 125.0,
  nextTicketNo: 1500,
  tickets: [],
  transactions: [],
  competitions: {
    "weekly-1000": {
      id: "weekly-1000",
      title: "Weekly Community Draw",
      prize: "£1,000 Cash",
      desc: "Transparent odds, capped tickets, and a guaranteed draw.",
      badge: "LIVE DRAW",
      sold: 650,
      cap: 1000,
      price: 5,
      odds: "1 in 1000",
      ends: "Ends in 3 days"
    },
    "midweek-500": {
      id: "midweek-500",
      title: "Midweek Quick Draw",
      prize: "£500 Cash",
      desc: "Faster draw with limited availability.",
      badge: "LIVE DRAW",
      sold: 410,
      cap: 500,
      price: 2,
      odds: "1 in 500",
      ends: "Ends tomorrow"
    }
  }
};

const WIN_CHANCE = 0.10; // 1 in 10

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function loadData() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    const fresh = deepClone(defaultData);
    localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.user) parsed.user = deepClone(defaultData.user);
    if (typeof parsed.balance !== "number") parsed.balance = defaultData.balance;
    if (!Array.isArray(parsed.tickets)) parsed.tickets = [];
    if (!Array.isArray(parsed.transactions)) parsed.transactions = [];
    if (!parsed.competitions) parsed.competitions = deepClone(defaultData.competitions);
    if (typeof parsed.nextTicketNo !== "number") parsed.nextTicketNo = defaultData.nextTicketNo;
    return parsed;
  } catch {
    const fresh = deepClone(defaultData);
    localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

function saveData(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }

function formatGBP(n) {
  const num = Number(n) || 0;
  return "£" + num.toFixed(2);
}

function setAllBalances(balance) {
  document.querySelectorAll(".balance, .balance-pill").forEach(el => {
    el.textContent = formatGBP(balance);
  });
}

function initHeaderBalance() {
  const data = loadData();
  setAllBalances(data.balance);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("show");
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("show");
}

function txDate() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function addFunds(amount) {
  const data = loadData();
  const add = Number(amount) || 0;
  if (add <= 0) return;

  data.balance = +(data.balance + add);
  data.transactions.unshift({ date: txDate(), desc: "Account Top-up", amount: +add });

  saveData(data);
  setAllBalances(data.balance);
}

function hydrateTransactionsPage() {
  const data = loadData();
  const tbody = document.querySelector("[data-transactions-body]");
  if (!tbody) return;

  tbody.innerHTML = "";
  data.transactions.slice(0, 50).forEach(tx => {
    const sign = tx.amount >= 0 ? "+" : "-";
    const amt = Math.abs(Number(tx.amount) || 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tx.date}</td>
      <td>${tx.desc}</td>
      <td class="status">${sign}${formatGBP(amt)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function initAddFundsUI() {
  document.querySelectorAll('[data-open-modal="addFundsModal"]').forEach(btn => {
    btn.addEventListener("click", () => openModal("addFundsModal"));
  });

  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close-modal")));
  });

  document.querySelectorAll("[data-topup]").forEach(btn => {
    btn.addEventListener("click", () => {
      const amount = Number(btn.getAttribute("data-topup"));
      addFunds(amount);
      closeModal("addFundsModal");
      hydrateTransactionsPage();
    });
  });

  const formBtn = document.querySelector("[data-topup-custom-btn]");
  if (formBtn) {
    formBtn.addEventListener("click", () => {
      const input = document.querySelector("[data-topup-custom]");
      const amount = Number(input && input.value);
      if (!amount || amount <= 0) return alert("Enter a valid amount.");
      addFunds(amount);
      if (input) input.value = "";
      closeModal("addFundsModal");
      hydrateTransactionsPage();
    });
  }

  const backdrop = document.getElementById("addFundsModal");
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal("addFundsModal");
    });
  }
}

/* ------------------------------ */
/* Instant Win helpers            */
/* ------------------------------ */
function canAfford(cost) {
  const data = loadData();
  return data.balance >= cost;
}

function chargePlay(gameName, cost) {
  const data = loadData();
  if (data.balance < cost) return { ok: false };

  data.balance = +(data.balance - cost);
  data.transactions.unshift({
    date: txDate(),
    desc: `Instant Win – ${gameName} (Play)`,
    amount: -cost
  });

  saveData(data);
  setAllBalances(data.balance);
  return { ok: true };
}

function payWin(gameName, prize) {
  const data = loadData();
  const p = Number(prize) || 0;
  if (p <= 0) return;

  data.balance = +(data.balance + p);
  data.transactions.unshift({
    date: txDate(),
    desc: `Instant Win – ${gameName} (Win)`,
    amount: +p
  });

  saveData(data);
  setAllBalances(data.balance);
}

function pickPrizeWeighted(prizeWeights) {
  const total = prizeWeights.reduce((a, x) => a + x.weight, 0);
  let r = Math.random() * total;
  for (const x of prizeWeights) {
    r -= x.weight;
    if (r <= 0) return x.prize;
  }
  return prizeWeights[prizeWeights.length - 1].prize;
}

/* Scratch canvas with snap-to-reveal at 75% */
function setupScratchCanvas(canvas, onReveal) {
  const ctx = canvas.getContext("2d");
  let isDown = false;
  let revealed = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    // draw using CSS pixel coordinates
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(220,220,220,0.92)";
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = "rgba(0,0,0,0.07)";
    for (let y = 0; y < rect.height; y += 12) ctx.fillRect(0, y, rect.width, 1);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = "900 18px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SCRATCH", rect.width / 2, rect.height / 2);
  }

  function scratchAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  function percentCleared() {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let cleared = 0;
    for (let i = 3; i < img.length; i += 4 * 16) {
      if (img[i] === 0) cleared++;
    }
    const total = Math.floor(img.length / (4 * 16));
    return total ? (cleared / total) : 0;
  }

  function snapReveal() {
    if (revealed) return;
    revealed = true;

    // fully clear overlay
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    canvas.style.display = "none";
    onReveal?.();
  }

  function maybeReveal() {
    if (revealed) return;
    if (percentCleared() >= 0.75) snapReveal();
  }

  function pointerDown(e) {
    isDown = true;
    const p = (e.touches && e.touches[0]) ? e.touches[0] : e;
    scratchAt(p.clientX, p.clientY);
    maybeReveal();
  }
  function pointerMove(e) {
    if (!isDown) return;
    const p = (e.touches && e.touches[0]) ? e.touches[0] : e;
    scratchAt(p.clientX, p.clientY);
    maybeReveal();
  }
  function pointerUp() { isDown = false; }

  function resetOverlay() {
    revealed = false;
    canvas.style.display = "block";
    resize();
  }

  canvas.addEventListener("mousedown", pointerDown);
  canvas.addEventListener("mousemove", pointerMove);
  window.addEventListener("mouseup", pointerUp);

  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); pointerDown(e); }, { passive: false });
  canvas.addEventListener("touchmove", (e) => { e.preventDefault(); pointerMove(e); }, { passive: false });
  window.addEventListener("touchend", pointerUp);

  window.addEventListener("resize", () => {
    if (!revealed) resize();
  });

  resetOverlay();
  return { resetOverlay, snapReveal };
}

/* ------------------------------ */
/* Instant Win main               */
/* ------------------------------ */
function initInstantWin() {
  const scratchPlay = document.querySelector("[data-scratch-play]");
  const boxGrid = document.querySelector("[data-box-grid]");
  const wheel = document.querySelector("[data-wheel]");
  if (!scratchPlay && !boxGrid && !wheel) return;

  // ---- Scratch Card ----
  const scratchSlots = Array.from(document.querySelectorAll("[data-scratch-slot]"));
  const scratchResult = document.querySelector("[data-scratch-result]");
  const scratchReset = document.querySelector("[data-scratch-reset]");
  const scratchCanvas = document.querySelector("[data-scratch-canvas]");

  const scratchSymbols = ["🍒","🍋","🍇","⭐","💎","🎁"];
  const scratchWinPrizes = [
    { prize: 2,  weight: 45 },
    { prize: 5,  weight: 28 },
    { prize: 10, weight: 18 },
    { prize: 25, weight: 7.5 },
    { prize: 50, weight: 1.5 }
  ];

  let scratchArmed = false;
  let scratchPendingPrize = 0;
  let scratchOverlayCtrl = null;

  function scratchResetUI() {
    scratchArmed = false;
    scratchPendingPrize = 0;
    scratchSlots.forEach(s => s.textContent = "❔");
    if (scratchCanvas) scratchCanvas.style.display = "block";
    if (scratchResult) scratchResult.textContent = "Press “New Card” to start, then scratch to reveal.";
  }

  if (scratchCanvas) {
    setTimeout(() => {
      scratchOverlayCtrl = setupScratchCanvas(scratchCanvas, () => {
        if (!scratchArmed) return;

        // recognise win by 3 matching symbols
        const symbols = scratchSlots.map(s => s.textContent);
        const isWin = symbols.length === 3 && symbols[0] === symbols[1] && symbols[1] === symbols[2];

        if (isWin && scratchPendingPrize > 0) {
          payWin("Scratch Card", scratchPendingPrize);
          if (scratchResult) scratchResult.textContent = `You won ${formatGBP(scratchPendingPrize)} 🎉`;
        } else {
          if (scratchResult) scratchResult.textContent = "Unlucky — no win this time.";
        }

        scratchArmed = false;
        scratchPendingPrize = 0;
        hydrateTransactionsPage();
      });
    }, 0);
  }

  if (scratchReset) {
    scratchReset.addEventListener("click", () => {
      scratchResetUI();
      scratchOverlayCtrl?.resetOverlay();
    });
  }

  if (scratchPlay) {
    scratchPlay.addEventListener("click", () => {
      const cost = 2;
      if (!canAfford(cost)) return alert("Not enough balance. Please add funds.");

      const charged = chargePlay("Scratch Card", cost);
      if (!charged.ok) return alert("Could not start a new card.");

      const isWin = Math.random() < WIN_CHANCE;
      scratchPendingPrize = isWin ? pickPrizeWeighted(scratchWinPrizes) : 0;

      if (scratchPendingPrize > 0) {
        const sym = scratchSymbols[Math.floor(Math.random() * scratchSymbols.length)];
        scratchSlots.forEach(s => s.textContent = sym);
      } else {
        let a = scratchSymbols[Math.floor(Math.random() * scratchSymbols.length)];
        let b = scratchSymbols[Math.floor(Math.random() * scratchSymbols.length)];
        let c = scratchSymbols[Math.floor(Math.random() * scratchSymbols.length)];
        if (a === b && b === c) c = scratchSymbols[(scratchSymbols.indexOf(c) + 1) % scratchSymbols.length];
        [a,b,c].forEach((v, idx) => scratchSlots[idx].textContent = v);
      }

      scratchArmed = true;
      if (scratchResult) scratchResult.textContent = "Scratch the card to reveal…";
      if (scratchCanvas) scratchCanvas.style.display = "block";
      scratchOverlayCtrl?.resetOverlay();

      hydrateTransactionsPage();
    });
  }

  scratchResetUI();

  // ---- Pick a Box ----
  const boxResult = document.querySelector("[data-box-result]");
  const boxReset = document.querySelector("[data-box-reset]");
  let boxLocked = false;

  const boxWinPrizes = [
    { prize: 1,  weight: 42 },
    { prize: 2,  weight: 28 },
    { prize: 5,  weight: 18 },
    { prize: 10, weight: 9.5 },
    { prize: 25, weight: 2.5 }
  ];

  function resetBoxes() {
    boxLocked = false;
    document.querySelectorAll(".box").forEach(b => {
      b.disabled = false;
      b.textContent = "?";
    });
    if (boxResult) boxResult.textContent = "Pick a box to reveal your prize.";
  }

  if (boxReset) boxReset.addEventListener("click", resetBoxes);

  if (boxGrid) {
    boxGrid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-box]");
      if (!btn || boxLocked) return;

      const cost = 1;
      if (!canAfford(cost)) return alert("Not enough balance. Please add funds.");

      const charged = chargePlay("Pick a Box", cost);
      if (!charged.ok) return alert("Could not play.");

      const isWin = Math.random() < WIN_CHANCE;
      const prize = isWin ? pickPrizeWeighted(boxWinPrizes) : 0;

      btn.textContent = prize > 0 ? `£${prize}` : "0";

      boxLocked = true;
      document.querySelectorAll(".box").forEach(b => b.disabled = true);

      if (prize > 0) {
        payWin("Pick a Box", prize);
        if (boxResult) boxResult.textContent = `You won ${formatGBP(prize)} 🎉`;
      } else {
        if (boxResult) boxResult.textContent = "No win this time.";
      }

      hydrateTransactionsPage();
    });
  }

  resetBoxes();

  // ---- Spin the Wheel ----
  const wheelSpin = document.querySelector("[data-wheel-spin]");
  const wheelReset = document.querySelector("[data-wheel-reset]");
  const wheelResult = document.querySelector("[data-wheel-result]");

  let wheelBusy = false;
  let wheelRotation = 0;

  const wheelWinPrizes = [
    { prize: 2,   weight: 34 },
    { prize: 5,   weight: 26 },
    { prize: 10,  weight: 20 },
    { prize: 15,  weight: 12 },
    { prize: 25,  weight: 6.5 },
    { prize: 50,  weight: 1.4 },
    { prize: 100, weight: 0.1 }
  ];

  const wheelSlices = [
    { prize: 0,   label: "£0" },   // index 0
    { prize: 2,   label: "£2" },
    { prize: 5,   label: "£5" },
    { prize: 10,  label: "£10" },
    { prize: 15,  label: "£15" },
    { prize: 25,  label: "£25" },
    { prize: 50,  label: "£50" },
    { prize: 100, label: "£100" }
  ];

  function spinResetUI() {
    wheelBusy = false;
    wheelRotation = 0;
    if (wheel) wheel.style.transform = `rotate(0deg)`;
    if (wheelResult) wheelResult.textContent = "Spin the wheel to win instantly.";
  }

  if (wheelReset) wheelReset.addEventListener("click", spinResetUI);

  if (wheelSpin) {
    wheelSpin.addEventListener("click", () => {
      const cost = 2;
      if (wheelBusy) return;
      if (!canAfford(cost)) return alert("Not enough balance. Please add funds.");

      const charged = chargePlay("Spin the Wheel", cost);
      if (!charged.ok) return alert("Could not play.");

      wheelBusy = true;
      if (wheelResult) wheelResult.textContent = "Spinning...";

      const isWin = Math.random() < WIN_CHANCE;
      const prize = isWin ? pickPrizeWeighted(wheelWinPrizes) : 0;

      const sliceIndex = wheelSlices.findIndex(s => s.prize === prize);
      const safeIndex = sliceIndex >= 0 ? sliceIndex : 0;

      const slice = 360 / 8;
      const spins = 5 + Math.floor(Math.random() * 3);
      const target = (spins * 360) + (safeIndex * slice) + (slice / 2);

      wheelRotation += target;
      if (wheel) wheel.style.transform = `rotate(${wheelRotation}deg)`;

      setTimeout(() => {
        if (prize > 0) {
          payWin("Spin the Wheel", prize);
          if (wheelResult) wheelResult.textContent = `You won ${formatGBP(prize)} 🎉`;
        } else {
          if (wheelResult) wheelResult.textContent = "No win this time.";
        }

        wheelBusy = false;
        hydrateTransactionsPage();
      }, 3250);
    });
  }

  spinResetUI();
}

/* Boot */
document.addEventListener("DOMContentLoaded", () => {
  initHeaderBalance();
  initAddFundsUI();
  hydrateTransactionsPage();
  initInstantWin();
});
