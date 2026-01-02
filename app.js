// app.js (fixed)
const STORE_KEY = "compot_data_v1";

const defaultData = {
  user: { name: "John Smith", email: "john@example.com" },
  balance: 125.0,
  nextTicketNo: 1500,
  tickets: [
    { compId: "weekly-1000", compName: "Weekly Community Draw", status: "Live", ticketRange: "#1023–1027", qty: 5 },
    { compId: "midweek-500", compName: "Midweek Quick Draw", status: "Live", ticketRange: "#1201–1202", qty: 2 }
  ],
  transactions: [
    { date: "12 Jan 2026", desc: "Flash Draw – Winnings", amount: 250 },
    { date: "10 Jan 2026", desc: "Weekly Draw Tickets", amount: -25 }
  ],
  competitions: {
    "weekly-1000": { sold: 650, cap: 1000, price: 5, odds: "1 in 1000", ends: "Ends in 3 days" },
    "midweek-500": { sold: 410, cap: 500, price: 2, odds: "1 in 500", ends: "Ends tomorrow" }
  }
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadData() {
  const raw = localStorage.getItem(STORE_KEY);

  if (!raw) {
    const fresh = deepClone(defaultData);
    localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
    return fresh;
  }

  try {
    const parsed = JSON.parse(raw);

    // Ensure required keys exist (prevents crashes if storage is incomplete)
    if (!parsed.user) parsed.user = deepClone(defaultData.user);
    if (typeof parsed.balance !== "number") parsed.balance = defaultData.balance;
    if (typeof parsed.nextTicketNo !== "number") parsed.nextTicketNo = defaultData.nextTicketNo;
    if (!Array.isArray(parsed.tickets)) parsed.tickets = [];
    if (!Array.isArray(parsed.transactions)) parsed.transactions = [];
    if (!parsed.competitions) parsed.competitions = deepClone(defaultData.competitions);

    return parsed;
  } catch (e) {
    const fresh = deepClone(defaultData);
    localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

function saveData(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

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

function addFunds(amount) {
  const data = loadData();
  const add = Number(amount) || 0;
  if (add <= 0) return;

  data.balance = +(data.balance + add);

  data.transactions.unshift({
    date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    desc: "Account Top-up",
    amount: +add
  });

  saveData(data);
  setAllBalances(data.balance);

  const balEl = document.querySelector("[data-balance-amount]");
  if (balEl) balEl.textContent = formatGBP(data.balance);
}

/* Helpers */
function ticketRange(start, qty) {
  const end = start + qty - 1;
  return qty === 1 ? `#${start}` : `#${start}–${end}`;
}

function buyTickets({ compId, compName, pricePerTicket, qty }) {
  const data = loadData();
  const q = Number(qty) || 1;
  const price = Number(pricePerTicket) || 0;
  const total = price * q;

  if (total <= 0) return false;

  if (data.balance < total) {
    alert("Not enough balance. Please add funds.");
    return false;
  }

  // Deduct balance
  data.balance = +(data.balance - total);

  // Assign ticket numbers
  const start = data.nextTicketNo;
  data.nextTicketNo = start + q;

  // Add ticket record
  const range = ticketRange(start, q);
  data.tickets.unshift({ compId, compName, status: "Live", ticketRange: range, qty: q });

  // Competition sold counter (safe)
  if (data.competitions && data.competitions[compId]) {
    const c = data.competitions[compId];
    c.sold = Math.min(c.cap, (Number(c.sold) || 0) + q);
  }

  // Transaction
  data.transactions.unshift({
    date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    desc: `${compName} – Tickets (${q} × ${formatGBP(price)})`,
    amount: -total
  });

  saveData(data);
  setAllBalances(data.balance);

  const balEl = document.querySelector("[data-balance-amount]");
  if (balEl) balEl.textContent = formatGBP(data.balance);

  return true;
}

/* Hydrators */
function hydrateAccount() {
  const data = loadData();

  const nameEl = document.querySelector("[data-user-name]");
  const emailEl = document.querySelector("[data-user-email]");
  if (nameEl) nameEl.textContent = data.user.name;
  if (emailEl) emailEl.textContent = data.user.email;

  const balEl = document.querySelector("[data-balance-amount]");
  if (balEl) balEl.textContent = formatGBP(data.balance);

  const tbody = document.querySelector("[data-active-tickets-body]");
  if (tbody) {
    tbody.innerHTML = "";
    const active = data.tickets.filter(t => t.status === "Live").slice(0, 8);
    active.forEach(t => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${t.compName}</td>
        <td>${t.qty}</td>
        <td class="status">${t.status}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function hydrateTicketsPage() {
  const data = loadData();
  const tbody = document.querySelector("[data-tickets-body]");
  if (!tbody) return;

  tbody.innerHTML = "";
  data.tickets.slice(0, 20).forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.compName}</td>
      <td>${t.ticketRange}</td>
      <td class="status">${t.status}</td>
    `;
    tbody.appendChild(tr);
  });
}

function hydrateTransactionsPage() {
  const data = loadData();
  const tbody = document.querySelector("[data-transactions-body]");
  if (!tbody) return;

  tbody.innerHTML = "";
  data.transactions.slice(0, 30).forEach(tx => {
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

function hydrateIndexCompetitions() {
  const data = loadData();

  document.querySelectorAll("[data-comp-card]").forEach(card => {
    const compId = card.getAttribute("data-comp-id");
    const info = data.competitions && data.competitions[compId];
    if (!info) return;

    const soldEl = card.querySelector("[data-comp-sold]");
    const capEl = card.querySelector("[data-comp-cap]");
    const progEl = card.querySelector("[data-comp-progress]");

    if (soldEl) soldEl.textContent = info.sold;
    if (capEl) capEl.textContent = info.cap;
    if (progEl) {
      const pct = Math.round((info.sold / info.cap) * 100);
      progEl.style.width = pct + "%";
    }
  });
}

function hydrateCompetitionDetail() {
  const data = loadData();
  const detail = document.querySelector("[data-comp-detail]");
  if (!detail) return;

  const compId = detail.getAttribute("data-comp-id");
  const info = data.competitions && data.competitions[compId];
  if (!info) return;

  const soldEl = detail.querySelector("[data-detail-sold]");
  const capEl = detail.querySelector("[data-detail-cap]");
  const progEl = detail.querySelector("[data-detail-progress]");

  if (soldEl) soldEl.textContent = info.sold;
  if (capEl) capEl.textContent = info.cap;
  if (progEl) {
    const pct = Math.round((info.sold / info.cap) * 100);
    progEl.style.width = pct + "%";
  }
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

function initCompetitionPurchase() {
  const compRoot = document.querySelector("[data-competition]");
  if (!compRoot) return;

  const compId = compRoot.getAttribute("data-comp-id");
  const compName = compRoot.getAttribute("data-comp-name");
  const price = Number(compRoot.getAttribute("data-price"));

  let selectedQty = 1;

  const qtyButtons = compRoot.querySelectorAll("[data-qty]");
  const totalEl = compRoot.querySelector("[data-total]");
  const buyBtn = compRoot.querySelector("[data-buy]");

  function setActiveQty(q) {
    selectedQty = q;
    qtyButtons.forEach(b => b.classList.toggle("active", Number(b.getAttribute("data-qty")) === q));
    if (totalEl) totalEl.textContent = formatGBP(price * selectedQty);
  }

  qtyButtons.forEach(btn => {
    btn.addEventListener("click", () => setActiveQty(Number(btn.getAttribute("data-qty"))));
  });

  setActiveQty(1);

  if (buyBtn) {
    buyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const ok = buyTickets({ compId, compName, pricePerTicket: price, qty: selectedQty });
      if (ok) {
        alert(`Purchased ${selectedQty} ticket(s) for ${compName}.`);
        hydrateTicketsPage();
        hydrateTransactionsPage();
        hydrateAccount();
        hydrateIndexCompetitions();
        hydrateCompetitionDetail();
      }
    });
  }
}

/* Boot */
document.addEventListener("DOMContentLoaded", () => {
  initHeaderBalance();
  initAddFundsUI();

  hydrateAccount();
  hydrateTicketsPage();
  hydrateTransactionsPage();

  hydrateIndexCompetitions();
  hydrateCompetitionDetail();

  initCompetitionPurchase();
});
