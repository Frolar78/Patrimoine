// ── Lock screen ───────────────────────────────────────────────────────────────
(function() {
  const PASSWORD = "Ell@30092021"; // ← changez ici
  const SESSION_KEY = "mp_unlocked";

  const lockScreen = document.getElementById("lockScreen");
  const lockInput  = document.getElementById("lockInput");
  const lockBtn    = document.getElementById("lockBtn");
  const lockError  = document.getElementById("lockError");

  // Déjà déverrouillé dans cette session
  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    lockScreen.style.display = "none";
    return;
  }

  function tryUnlock() {
    if (lockInput.value === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      lockScreen.classList.add("lock-fadeout");
      setTimeout(() => lockScreen.style.display = "none", 500);
    } else {
      lockError.textContent = "Code incorrect, réessayez.";
      lockInput.classList.add("error");
      lockInput.value = "";
      setTimeout(() => {
        lockInput.classList.remove("error");
        lockError.textContent = "";
      }, 1000);
    }
  }

  lockBtn.addEventListener("click", tryUnlock);
  lockInput.addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });
})();

// ── Theme toggle ──────────────────────────────────────────────────────────────
const html = document.documentElement;
const themeBtn = document.getElementById("themeToggle");

if (localStorage.getItem("theme") === "dark") html.setAttribute("data-theme", "dark");

function toggleTheme() {
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  localStorage.setItem("theme", isDark ? "light" : "dark");
  if (allocChart) {
    const immo = getComputedStyle(document.documentElement).getPropertyValue('--color-immo').trim();
    const pea  = getComputedStyle(document.documentElement).getPropertyValue('--color-pea').trim();
    const cash = getComputedStyle(document.documentElement).getPropertyValue('--color-cash').trim();
    allocChart.data.datasets[0].backgroundColor = [immo, pea, cash];
    allocChart.update();
  }
}

themeBtn.addEventListener("click", toggleTheme);
document.getElementById("themePill")?.addEventListener("click", toggleTheme);


// ── Greeting ──────────────────────────────────────────────────────────────────
const now   = new Date();
const hour  = now.getHours();
const greet = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
document.getElementById("greetingText").textContent = greet + " !";

const dateStr = now.toLocaleDateString("fr-FR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
document.getElementById("greetingDate").textContent = "Voici la synthèse de votre patrimoine au " + dateStr + ".";
document.getElementById("topbarDate").textContent = now.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" });

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtEur = new Intl.NumberFormat("fr-FR", { style:"currency", currency:"EUR", maximumFractionDigits:0 });

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "--";
}

// ── CSV parser (RFC-4180) ─────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i+1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"')            { inQuotes = false; }
      else                            { field += ch; }
    } else {
      if      (ch === '"')            { inQuotes = true; }
      else if (ch === ',')            { row.push(field); field = ""; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(field); field = ""; rows.push(row); row = [];
      } else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseNum(val) {
  if (!val) return 0;
  let s = val.toString().replace(/"/g,"").replace(/%/g,"").replace(/[€]/g,"").trim();
  if (/^\d{1,3}([.\s\u00a0\u202f]\d{3})+,\d+$/.test(s)) {
    s = s.replace(/[\s\u00a0\u202f.]/g,"").replace(",",".");
  } else {
    s = s.replace(/[\s\u00a0\u202f]/g,"").replace(",",".");
  }
  return parseFloat(s) || 0;
}

function parsePercent(val) { return parseNum(val); }

// ── Navigation ────────────────────────────────────────────────────────────────
const navLinks   = document.querySelectorAll(".nav-link");
const mobileBtns = document.querySelectorAll(".mobile-btn");
const pages      = document.querySelectorAll(".page");

function switchPage(page) {
  pages.forEach(p => p.classList.remove("active-page"));
  const pageEl = document.getElementById(page + "Page") || document.getElementById(page + "ePage");
  if (pageEl) pageEl.classList.add("active-page");
  navLinks.forEach(l => l.classList.remove("active"));
  mobileBtns.forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add("active"));
}

[...navLinks, ...mobileBtns, ...document.querySelectorAll(".see-more")].forEach(el => {
  el.addEventListener("click", e => { e.preventDefault(); switchPage(el.dataset.page); });
});

// ── Wealth chart ──────────────────────────────────────────────────────────────
let wealthData = [];
let wealthLabels = [];
let peaData_hist = [];
let peaLabels_hist = [];

async function loadHistorique() {
  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-CBoyk52n52AhBbdKFFRTsUT3Dp1XVlg3BxL_QRZV682ToOlotYHwumcxSHH1YHuuJKyae99Ll1c3/pub?gid=1865808494&single=true&output=csv";
  try {
    const res = await fetch(url);
    const csv = await res.text();
    const rows = parseCSV(csv.trim()).slice(1).filter(r => r[0] && r[3]);

    wealthData   = rows.map(r => parseNum(r[3]));
    wealthLabels = rows.map(r => {
      const parts = r[0].split(" ")[0].split("/");
      const d = new Date(parts[2], parts[1]-1, parts[0]);
      return d.toLocaleDateString("fr-FR", { month:"short", year:"2-digit" });
    });

    peaData_hist   = rows.map(r => parseNum(r[5] || "")).filter(v => v > 0);
    peaLabels_hist = rows
      .filter(r => parseNum(r[5] || "") > 0)
      .map(r => {
        const parts = r[0].split(" ")[0].split("/");
        const d = new Date(parts[2], parts[1]-1, parts[0]);
        return d.toLocaleDateString("fr-FR", { month:"short", year:"2-digit" });
      });

  } catch(e) {
    console.warn("Historique indisponible", e);
    wealthData   = [];
    wealthLabels = [];
  }
}

let wealthChart;
let currentRange = 12;

function renderWealthChart(range) {
  currentRange = range;
  const slice  = range === "all" ? wealthData   : wealthData.slice(-range);
  const labels = range === "all" ? wealthLabels : wealthLabels.slice(-range);

  if (wealthChart) {
    wealthChart.data.labels = labels;
    wealthChart.data.datasets[0].data = slice;
    wealthChart.update();
    return;
  }

  const canvas = document.getElementById("wealthChart");
  const ctx    = canvas.getContext("2d");
  const grad   = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, "rgba(79,110,247,.18)");
  grad.addColorStop(1, "rgba(79,110,247,0)");

  wealthChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Patrimoine net",
        data: slice,
        borderColor: "#4f6ef7",
        backgroundColor: grad,
        fill: true,
        tension: .42,
        pointRadius: 4,
        pointBackgroundColor: "#4f6ef7",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmtEur.format(ctx.parsed.y) } }
      },
      scales: {
        x: { grid:{ display:false }, ticks:{ color:"#9aa0b4", font:{ size:11 } } },
        y: { grid:{ color:"rgba(0,0,0,.04)" }, ticks:{ color:"#9aa0b4", font:{ size:11 }, callback: v => fmtEur.format(v) } }
      }
    }
  });
}

function initWealthChart() { renderWealthChart(12); }

// ── Allocation chart ──────────────────────────────────────────────────────────
let allocChart;
function initAllocChart(immo, pea, cash) {
  if (allocChart) allocChart.destroy();
  allocChart = new Chart(document.getElementById("allocationChart"), {
    type: "doughnut",
    data: {
      labels: ["Immobilier","Actions (PEA)","Cash & Liquidités"],
      datasets: [{
        data: [immo, pea, cash],
        backgroundColor: [
          getComputedStyle(document.documentElement).getPropertyValue('--color-immo').trim(),
          getComputedStyle(document.documentElement).getPropertyValue('--color-pea').trim(),
          getComputedStyle(document.documentElement).getPropertyValue('--color-cash').trim()
        ],
        borderWidth: 0,
        cutout: "74%"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend:{ display:false } }
    }
  });
}

// ── Render goals ──────────────────────────────────────────────────────────────
function renderGoals(data, currentNet, peaVal) {
  const defaultGoals = [
    { label:"PEA 10 000 €",             target:10000,  type:"pea" },
    { label:"PEA 50 000 €",             target:50000,  type:"pea" },
    { label:"PEA 100 000 €",            target:100000, type:"pea" },
    { label:"Patrimoine net 100 000 €", target:100000, type:"net" }
  ];

  const goals = defaultGoals.map((g, i) => {
    const label   = data[`goal${i+1}_label`]  || g.label;
    const target  = data[`goal${i+1}_target`] ? parseNum(data[`goal${i+1}_target`]) : g.target;
    const current = data[`goal${i+1}_current`]
      ? parseNum(data[`goal${i+1}_current`])
      : (g.type === "pea" ? peaVal : currentNet);
    const pct = Math.min(100, Math.round(current / target * 100));
    return { label, target, current, pct };
  });

  const grid = document.getElementById("goalsGrid");
  if (grid) {
    grid.innerHTML = goals.map(g => `
      <div class="goal-card">
        <div class="goal-card-title">${g.label}</div>
        <div class="goal-card-value">${fmtEur.format(g.current)}</div>
        <div class="goal-card-sub">/ ${fmtEur.format(g.target)}</div>
        <div class="goal-bar"><span style="width:${g.pct}%"></span></div>
        <div class="goal-card-pct">${g.pct} %</div>
      </div>
    `).join("");
  }

  const full = document.getElementById("goalsFull");
  if (full) {
    full.innerHTML = goals.map(g => `
      <div class="goal-full-item">
        <div class="goal-full-top">
          <strong>${g.label}</strong>
          <span>${fmtEur.format(g.current)} / ${fmtEur.format(g.target)}</span>
        </div>
        <div class="goal-full-bar"><span style="width:${g.pct}%"></span></div>
        <div class="goal-full-pct">${g.pct} %</div>
      </div>
    `).join("");
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function showSkeleton() {
  document.querySelectorAll(".kpi-value:not(.kpi-static), .asset-value").forEach(el => {
    el.classList.add("skeleton");
    el.textContent = "";
  });
}

function hideSkeleton() {
  document.querySelectorAll(".skeleton").forEach(el => el.classList.remove("skeleton"));
}

// ── Error banner ──────────────────────────────────────────────────────────────
function showError(msg) {
  const existing = document.getElementById("errorBanner");
  if (existing) existing.remove();
  const banner = document.createElement("div");
  banner.id = "errorBanner";
  banner.className = "error-banner";
  banner.innerHTML = `
    <span>⚠ Impossible de charger les données — ${msg}</span>
    <button onclick="document.getElementById('errorBanner').remove(); loadSheetData()">Réessayer</button>
  `;
  document.querySelector("main").prepend(banner);
  const dot = document.querySelector(".sync-dot");
  if (dot) { dot.style.background = "#e53e3e"; dot.style.boxShadow = "0 0 6px #e53e3e"; }
  setText("lastUpdate", "Erreur de synchronisation");
}

function clearError() {
  const existing = document.getElementById("errorBanner");
  if (existing) existing.remove();
  const dot = document.querySelector(".sync-dot");
  if (dot) { dot.style.background = ""; dot.style.boxShadow = ""; }
}

// ── Load sheet data ───────────────────────────────────────────────────────────
async function loadSheetData() {
  showSkeleton();

  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-CBoyk52n52AhBbdKFFRTsUT3Dp1XVlg3BxL_QRZV682ToOlotYHwumcxSHH1YHuuJKyae99Ll1c3/pub?gid=512150963&single=true&output=csv";
  let csv;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csv = await res.text();
  } catch (err) {
    hideSkeleton();
    showError(err.message);
    return;
  }

  clearError();

  const rows = parseCSV(csv.trim());
  const data = {};
  rows.slice(1).forEach(r => { if (r[0]) data[r[0].trim()] = r[1] ?? ""; });
  console.log("Sheet:", data);

  // ── Valeurs de base ───────────────────────────────────────────────────────
  const netNum      = parseNum(data.patrimoine_net);
  const immoNetNum  = parseNum(data.immobilier_net);
  const immoBrutNum = parseNum(data.immobilier_brut);
  const peaNum      = parseNum(data.pea_valeur);
  const cashNum     = parseNum(data.cash_disponible);

  const v1 = parseNum(data.immo_bien1_valeur);
  const d1 = parseNum(data.immo_bien1_dette);
  const n1 = parseNum(data.immo_bien1_net);
  const v2 = parseNum(data.immo_bien2_valeur);
  const d2 = parseNum(data.immo_bien2_dette);
  const n2 = parseNum(data.immo_bien2_net);
  
// ── Données locatives Kilford (bien1) ─────────────────────────────────────
const loyer        = parseNum(data.immo_bien1_loyer);
const mensualite1  = parseNum(data.immo_bien1_mensualite);
const chargesMens  = parseNum(data.immo_bien1_charges);
const cashflow     = parseNum(data.immo_bien1_cashflow);
const rendBrut     = parseNum(data.immo_bien1_rendement_brut);
const rendNet      = parseNum(data.immo_bien1_rendement_net);
const taxe         = parseNum(data.immo_bien1_taxe_fonciere);
const copro        = parseNum(data.immo_bien1_charges_copro);
const assurPno     = parseNum(data.immo_bien1_assurance_pno);
const assurCredit  = parseNum(data.immo_bien1_assurance_credit);
const gestion      = parseNum(data.immo_bien1_gestion_locative);
const comptable    = parseNum(data.immo_bien1_comptable_lmnp);
const chargesTotal = taxe + copro + assurPno + assurCredit + gestion + comptable;
const debutKilford = new Date(2021, 8, 1); // sept 2021
const debutTurbie  = new Date(2026, 5, 1); // juin 2026
const today2       = new Date();

const moisK = (today2.getFullYear() - debutKilford.getFullYear()) * 12 + (today2.getMonth() - debutKilford.getMonth()) + 1;
const moisT = (today2.getFullYear() - debutTurbie.getFullYear()) * 12 + (today2.getMonth() - debutTurbie.getMonth()) + 1;

const capitalMensuel  = moisK > 0 && moisK <= 300 ? Math.round(getKilfordCapital(moisK))  : 0;
const capitalMensuel2 = moisT > 0 && moisT <= 300 ? Math.round(getTurbieCapital(moisT)) : 0;
const interetsMensuel  = capitalMensuel  > 0 ? Math.round(1623.24 - capitalMensuel) : 0;
const interetsMensuel2 = capitalMensuel2 > 0 ? Math.round(2082.46 - capitalMensuel2) : 0;
const pctCapital1  = mensualite1  > 0 ? Math.round(capitalMensuel  / mensualite1  * 100) : 0;
const pctCapital2  = capitalMensuel2 > 0 ? Math.round(capitalMensuel2 / 2082.46 * 100) : 0;

const creationPatrim  = capitalMensuel - Math.abs(cashflow);
const creationTotal   = capitalMensuel + capitalMensuel2 - Math.abs(cashflow);

  
  // ── Variation mensuelle ───────────────────────────────────────────────────
const last = wealthData.length > 0 ? wealthData[wealthData.length - 1] : null;

// Trouver le dernier point du mois précédent
const currentMonth = new Date().getMonth();
const currentYear  = new Date().getFullYear();
const prevMonthIdx = wealthLabels.reduce((found, label, i) => {
  const parts = label.split(" ");
  const labelMonth = new Date(Date.parse(parts[0] + " 1 20" + parts[1])).getMonth();
  const labelYear  = new Date(Date.parse(parts[0] + " 1 20" + parts[1])).getFullYear();
  const isPrevMonth = (labelMonth === (currentMonth === 0 ? 11 : currentMonth - 1)) &&
    (labelYear === (currentMonth === 0 ? currentYear - 1 : currentYear));
  return isPrevMonth ? i : found;
}, -1);

const prev = prevMonthIdx >= 0 ? wealthData[prevMonthIdx] : (wealthData.length > 1 ? wealthData[wealthData.length - 2] : null);
const diff = data.variation_mensuelle ? parseNum(data.variation_mensuelle) : (last && prev ? last - prev : null);

  const pos     = diff !== null && diff >= 0;
  const diffFmt = diff !== null ? (pos ? "+" : "") + fmtEur.format(diff) : "--";
  const pctMens = diff !== null && prev ? (diff / prev * 100) : null;
  const pctFmt  = pctMens !== null ? (pos ? "+" : "") + pctMens.toFixed(2) + " %" : "--";

  // ── Allocation ────────────────────────────────────────────────────────────
  const allocImmo = parsePercent(data.allocation_immobilier);
  const allocPea  = parsePercent(data.allocation_pea);
  const allocCash = parsePercent(data.allocation_cash);

  // ── % net ─────────────────────────────────────────────────────────────────
  const pctNetImmo = netNum ? ((immoNetNum / netNum) * 100).toFixed(1) + " %" : "--";
  const pctNetPea  = netNum ? ((peaNum     / netNum) * 100).toFixed(1) + " %" : "--";
  const pctNetCash = netNum ? ((cashNum    / netNum) * 100).toFixed(1) + " %" : "--";

  // ── PEA perf ──────────────────────────────────────────────────────────────
  const peaPerf = parsePercent(data.pea_performance);
  const peaPerfText = isNaN(peaPerf) || peaPerf === 0 ? "--" : (peaPerf >= 0 ? "+" : "") + peaPerf.toFixed(1) + " %";

  // ── YTD ───────────────────────────────────────────────────────────────────
  let ytdText = "--";
  if (data.perf_ytd) {
    const ytdVal = parseNum(data.perf_ytd);
    ytdText = (ytdVal >= 0 ? "+" : "") + ytdVal.toFixed(1) + " %";
  } else {
    const yearStr = new Date().getFullYear().toString().slice(-2);
    const firstOfYearIdx = wealthLabels.findIndex(l => l.includes(yearStr));
    const janVal  = firstOfYearIdx >= 0 ? wealthData[firstOfYearIdx] : wealthData[0];
    const lastVal = wealthData[wealthData.length - 1];
    if (janVal && lastVal) {
      const ytdPct = ((lastVal - janVal) / janVal * 100);
      ytdText = (ytdPct >= 0 ? "+" : "") + ytdPct.toFixed(1) + " %";
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MISE À JOUR DOM
  // ════════════════════════════════════════════════════════════════════════════

  // KPIs overview
  setText("patrimoineNet",  data.patrimoine_net);
  setText("patrimoineBrut", data.patrimoine_brut);
  setText("dettes",         data.dettes);
  setText("cashKpi",        data.cash_disponible);
  setText("variationMensuelle", diffFmt);
  document.getElementById("variationMensuelle")?.classList.toggle("negative", !pos);
  document.getElementById("variationMensuelle")?.classList.toggle("positive",  pos);
  setText("varMensuelleKpi",    diffFmt);
  setText("varMensuellePctKpi", pctFmt);
  setText("variationPct",       pctFmt);
  setText("perfYtd", ytdText);

  // Allocation donut + légende
  setText("allocImmoText", allocImmo + " %");
  setText("allocPeaText",  allocPea  + " %");
  setText("allocCashText", allocCash + " %");
  setText("allocImmoVal",  immoBrutNum ? fmtEur.format(immoBrutNum) : "--");
  setText("allocPeaVal",   data.pea_valeur      || "--");
  setText("allocCashVal",  data.cash_disponible || "--");
  initAllocChart(allocImmo, allocPea, allocCash);

  // Tableau détail
  setText("dtImmoVal",     immoBrutNum ? fmtEur.format(immoBrutNum) : "--");
  setText("dtImmoPctBrut", allocImmo + " %");
  setText("dtImmoPctNet",  pctNetImmo);
  const immoEvo = parseNum(data.immo_evo_mensuelle);
const immoEvoEl = document.getElementById("dtImmoEvo");
if (immoEvoEl) {
  immoEvoEl.textContent = immoEvo ? (immoEvo >= 0 ? "+" : "") + fmtEur.format(immoEvo) : "—";
  immoEvoEl.classList.toggle("positive", immoEvo >= 0);
  immoEvoEl.classList.toggle("negative", immoEvo < 0);
}
  setText("dtPeaVal",      data.pea_valeur || "--");
  setText("dtPeaPctBrut",  allocPea  + " %");
  setText("dtPeaPctNet",   pctNetPea);
  const peaEvo = parseNum(data.pea_evo_mensuelle);
const peaEvoEl = document.getElementById("dtPeaEvo");
if (peaEvoEl) {
  peaEvoEl.textContent = peaEvo ? (peaEvo >= 0 ? "+" : "") + fmtEur.format(peaEvo) : "—";
  peaEvoEl.classList.toggle("positive", peaEvo >= 0);
  peaEvoEl.classList.toggle("negative", peaEvo < 0);
}
  setText("dtCashVal",     data.cash_disponible || "--");
  setText("dtCashPctBrut", allocCash + " %");
  setText("dtCashPctNet",  pctNetCash);
  const cashEvo = parseNum(data.cash_evo_mensuelle);
const cashEvoEl = document.getElementById("dtCashEvo");
if (cashEvoEl) {
  cashEvoEl.textContent = cashEvo ? (cashEvo >= 0 ? "+" : "") + fmtEur.format(cashEvo) : "—";
  cashEvoEl.classList.toggle("positive", cashEvo >= 0);
  cashEvoEl.classList.toggle("negative", cashEvo < 0);
}
  setText("dtTotalVal",    data.patrimoine_brut || "--");
  setText("dtTotalPctNet", "100,0 %");
  setText("dtTotalEvo",    diffFmt);

  // Répartition barres
  document.getElementById("repImmoBar").style.width  = allocImmo + "%";
  document.getElementById("repPeaBar").style.width   = allocPea  + "%";
  document.getElementById("repCashBar").style.width  = allocCash + "%";
  setText("repImmoVal",     immoBrutNum ? fmtEur.format(immoBrutNum) : "--");
  setText("repPeaVal",      data.pea_valeur      || "--");
  setText("repCashVal",     data.cash_disponible || "--");
  setText("repTotalActifs", data.patrimoine_brut || "--");
  setText("repDettes",      data.dettes          || "--");
  setText("repPatNet",      data.patrimoine_net  || "--");

  // Mini panel Immo
  setText("immoBien1Nom",    data.immo_bien1_nom    || "Résidence principale");
  setText("immoBien1Valeur", data.immo_bien1_valeur || "--");
  setText("immoBien1Dette",  data.immo_bien1_dette  || "--");
  setText("immoBien1Net",    n1 ? fmtEur.format(n1) : (v1 || d1 ? fmtEur.format(v1 - d1) : "--"));
  setText("immoBien2Nom",    data.immo_bien2_nom    || "Bien 2");
  setText("immoBien2Valeur", data.immo_bien2_valeur || "--");
  setText("immoBien2Dette",  data.immo_bien2_dette  || "--");
  setText("immoBien2Net",    n2 ? fmtEur.format(n2) : (v2 || d2 ? fmtEur.format(v2 - d2) : "--"));

  // Mini panel PEA
  setText("peaActif1Nom",     data.pea_actif1_nom    || "--");
  setText("peaActif1Valeur",  data.pea_actif1_valeur || "--");
  setText("peaActif1Perf",    data.pea_actif1_perf ? parseNum(data.pea_actif1_perf).toFixed(1) + " %" : "—");
  setText("peaActif2Nom",     data.pea_actif2_nom    || "--");
  setText("peaActif2Valeur",  data.pea_actif2_valeur || "--");
  setText("peaActif2Perf",    data.pea_actif2_perf ? parseNum(data.pea_actif2_perf).toFixed(1) + " %" : "—");
  setText("peaValeurOverview",data.pea_valeur        || "--");
  setText("peaPerfOverview",  peaPerfText);

  // Mini panel Cash
  setText("cash1Nom",   data.cash1_nom); setText("cash1Valeur", data.cash1_valeur);
  setText("cash2Nom",   data.cash2_nom); setText("cash2Valeur", data.cash2_valeur);
  setText("cash3Nom",   data.cash3_nom); setText("cash3Valeur", data.cash3_valeur);
  setText("cash4Nom",   data.cash4_nom); setText("cash4Valeur", data.cash4_valeur);
  const c1 = parseNum(data.cash1_valeur);
  const c2 = parseNum(data.cash2_valeur);
  const c3 = parseNum(data.cash3_valeur);
  const c4 = parseNum(data.cash4_valeur);
  const totalCash = c1 + c2 + c3 + c4;
  setText("cashTotal", totalCash ? fmtEur.format(totalCash) : (data.cash_disponible || "--"));

// Page Immobilier
setText("immoP_brutTotal",  immoBrutNum ? fmtEur.format(immoBrutNum) : "--");
setText("immoP_detteTotal", data.dettes || "--");
setText("immoP_netTotal",   immoNetNum  ? fmtEur.format(immoNetNum)  : "--");
const creationTotalEl = document.getElementById("immoP_creationTotal");
if (creationTotalEl) {
  creationTotalEl.textContent = creationTotal ? (creationTotal >= 0 ? "+" : "") + fmtEur.format(creationTotal) : "--";
}

// Card Kilford
setText("immoP_bien1Nom",    data.immo_bien1_nom    || "Appartement Kilford");
setText("immoP_bien1Valeur", data.immo_bien1_valeur || "--");
setText("immoP_bien1Dette",  data.immo_bien1_dette  || "--");
setText("immoP_bien1Net",    n1 ? fmtEur.format(n1) : (v1 || d1 ? fmtEur.format(v1 - d1) : "--"));

setText("immoP_bien1Loyer",      loyer       ? fmtEur.format(loyer)       : "--");
setText("immoP_bien1Mensualite", mensualite1 ? fmtEur.format(mensualite1) : "--");
setText("immoP_bien1Charges", chargesMens ? fmtEur.format(Math.round(chargesMens / 12)) + "/mois" : "--");
const cfKilfordEl = document.getElementById("immoP_bien1Cashflow");
if (cfKilfordEl) {
  cfKilfordEl.textContent = cashflow !== 0 ? (cashflow >= 0 ? "+" : "") + fmtEur.format(cashflow) + "/mois" : "--";
  cfKilfordEl.classList.toggle("positive", cashflow >= 0);
  cfKilfordEl.classList.toggle("negative", cashflow < 0);
}
  
setText("immoP_bien1CapitalMensuel", capitalMensuel ? fmtEur.format(capitalMensuel) + "/mois" : "--");
setText("immoP_bien1Interets", interetsMensuel ? fmtEur.format(interetsMensuel) + "/mois" : "--");
const bar1K = document.getElementById("immoP_bien1CapitalBar");
if (bar1K) bar1K.style.width = pctCapital1 + "%";
setText("immoP_bien1CapitalPct", pctCapital1 + "% capital · " + (100 - pctCapital1) + "% intérêts");

const creationEl = document.getElementById("immoP_bien1CreationPatrim");
if (creationEl) {
  creationEl.textContent = creationPatrim ? (creationPatrim >= 0 ? "+" : "") + fmtEur.format(creationPatrim) + "/mois" : "--";
  creationEl.classList.toggle("positive", creationPatrim >= 0);
  creationEl.classList.toggle("negative", creationPatrim < 0);
}
setText("immoP_bien1RendBrut",    rendBrut ? rendBrut.toFixed(2) + " %" : "--");
setText("immoP_bien1RendNet",     rendNet  ? rendNet.toFixed(2)  + " %" : "--");
setText("immoP_bien1Taxe",        taxe        ? fmtEur.format(taxe)        : "--");
setText("immoP_bien1Copro",       copro       ? fmtEur.format(copro)       : "--");
setText("immoP_bien1AssurPno",    assurPno    ? fmtEur.format(assurPno)    : "--");
setText("immoP_bien1AssurCredit", assurCredit ? fmtEur.format(assurCredit) : "--");
setText("immoP_bien1Gestion",     gestion     ? fmtEur.format(gestion)     : "--");
setText("immoP_bien1Comptable",   comptable   ? fmtEur.format(comptable)   : "--");
setText("immoP_bien1ChargesTotal",chargesTotal ? fmtEur.format(chargesTotal) : "--");

// Card La Turbie
setText("immoP_bien2Nom",    data.immo_bien2_nom    || "Maison La Turbie");
setText("immoP_bien2Valeur", data.immo_bien2_valeur || "--");
setText("immoP_bien2Dette",  data.immo_bien2_dette  || "--");
setText("immoP_bien2Net",    n2 ? fmtEur.format(n2) : (v2 || d2 ? fmtEur.format(v2 - d2) : "--"));
setText("immoP_bien2CapitalMensuel", capitalMensuel2 ? fmtEur.format(capitalMensuel2) + "/mois" : "0 €/mois");
setText("immoP_bien2Interets", interetsMensuel2 ? fmtEur.format(interetsMensuel2) + "/mois" : "--");
const bar2T = document.getElementById("immoP_bien2CapitalBar");
if (bar2T) bar2T.style.width = pctCapital2 + "%";
setText("immoP_bien2CapitalPct", pctCapital2 + "% capital · " + (100 - pctCapital2) + "% intérêts");

setText("immoP_maj",  data.immo_derniere_maj || "--");
setText("immoP_maj2", data.immo_derniere_maj || "--");

  // Barres de remboursement
  const credits = [
    { initial: 423000, debut: new Date(2021, 6, 1), mensualites: 300, dette: d1, id: "1" },
    { initial: 430000, debut: new Date(2026, 5, 1), mensualites: 300, dette: d2, id: "2" }
  ];

  credits.forEach(c => {
    const today        = new Date();
    const moisEcoules  = Math.max(0, (today.getFullYear() - c.debut.getFullYear()) * 12 + (today.getMonth() - c.debut.getMonth()));
    const moisRestants = Math.max(0, c.mensualites - moisEcoules);
    const pctRembourse = Math.min(100, Math.round((c.initial - c.dette) / c.initial * 100));
    const dateEcheance = new Date(c.debut.getFullYear(), c.debut.getMonth() + c.mensualites, 1);
    const echeanceStr  = dateEcheance.toLocaleDateString("fr-FR", { month:"long", year:"numeric" });
    const el = document.getElementById(`creditBar${c.id}`);
    if (!el) return;
    el.style.width = pctRembourse + "%";
    setText(`creditPct${c.id}`,      pctRembourse + " % remboursé");
    setText(`creditMois${c.id}`,     moisRestants + " mensualités restantes");
    setText(`creditEcheance${c.id}`, "Échéance : " + echeanceStr);
  });

  // Page PEA
  setText("peaP_valeur",       data.pea_valeur        || "--");
  setText("peaP_actif1Nom",    data.pea_actif1_nom    || "--");
  setText("peaP_actif1Valeur", data.pea_actif1_valeur || "--");
  setText("peaP_actif2Nom",    data.pea_actif2_nom    || "--");
  setText("peaP_actif2Valeur", data.pea_actif2_valeur || "--");
  setText("peaP_perf",         peaPerfText);
  setText("peaP_verse",        data.pea_verse || "--");

  const peaVerse = parseNum(data.pea_verse);
  const plusValue = peaNum - peaVerse;
  setText("peaP_plusvalue", peaVerse ? (plusValue >= 0 ? "+" : "") + fmtEur.format(plusValue) : "--");

  const perf1 = parsePercent(data.pea_actif1_perf);
  const perf2 = parsePercent(data.pea_actif2_perf);
  setText("peaP_actif1Perf", isNaN(perf1) ? "--" : (perf1 >= 0 ? "+" : "") + perf1.toFixed(1) + " %");
  setText("peaP_actif2Perf", isNaN(perf2) ? "--" : (perf2 >= 0 ? "+" : "") + perf2.toFixed(1) + " %");

  const etf1Num = parseNum(data.pea_actif1_valeur);
  const etf2Num = parseNum(data.pea_actif2_valeur);
  const pct1 = peaNum ? Math.round(etf1Num / peaNum * 100) : 0;
  const pct2 = peaNum ? Math.round(etf2Num / peaNum * 100) : 0;
  setText("peaP_actif1Pct",    pct1 + " %");
  setText("peaP_actif2Pct",    pct2 + " %");
  setText("peaP_actif1PctBar", pct1 + " %");
  setText("peaP_actif2PctBar", pct2 + " %");
  const bar1 = document.getElementById("peaBar1");
  const bar2 = document.getElementById("peaBar2");
  if (bar1) bar1.style.width = pct1 + "%";
  if (bar2) bar2.style.width = pct2 + "%";

  // Page Cash
  setText("cashP_1Nom",  data.cash1_nom); setText("cashP_1Valeur", data.cash1_valeur);
  setText("cashP_2Nom",  data.cash2_nom); setText("cashP_2Valeur", data.cash2_valeur);
  setText("cashP_3Nom",  data.cash3_nom); setText("cashP_3Valeur", data.cash3_valeur);
  setText("cashP_4Nom",  data.cash4_nom); setText("cashP_4Valeur", data.cash4_valeur);

  const taux = [0.015, 0.0105, 0.015, 0.015];
  const cashVals = [c1, c2, c3, c4];
  const provision = 4770;
  const totalLivrets  = c1 + c2 + c3 + c4;
  const cashDispo     = totalLivrets - provision;
  const interetsTotal = cashVals.reduce((sum, v, i) => sum + v * taux[i], 0);

  setText("cashP_total", fmtEur.format(totalLivrets));
  const cashDispoEl = document.getElementById("cashP_dispo");
  if (cashDispoEl) {
    cashDispoEl.textContent = fmtEur.format(cashDispo);
    cashDispoEl.classList.toggle("negative", cashDispo < 0);
    cashDispoEl.classList.toggle("positive",  cashDispo >= 0);
  }
  setText("cashP_interets", "+" + fmtEur.format(Math.round(interetsTotal)));
  cashVals.forEach((v, i) => {
    setText(`cashP_${i+1}Interets`, "+" + fmtEur.format(Math.round(v * taux[i])));
  });

  // Épargne mensuelle
  const objectifEpargne = 2360;
  const epargneReelle   = parseNum(data.epargne_reelle_mensuelle);
  const epargneBar      = document.getElementById("cashP_epargneBar");
  const epargneHint     = document.getElementById("cashP_epargneHint");
  if (epargneReelle > 0) {
    const pctEpargne  = Math.min(120, Math.round(epargneReelle / objectifEpargne * 100));
    const diffEpargne = epargneReelle - objectifEpargne;
    if (epargneBar) {
      epargneBar.style.width = Math.min(100, pctEpargne) + "%";
      epargneBar.className   = diffEpargne >= 0 ? "" : "negative";
    }
    if (epargneHint) {
      epargneHint.textContent = diffEpargne >= 0
        ? "+" + fmtEur.format(diffEpargne) + " au-dessus de l'objectif"
        : fmtEur.format(Math.abs(diffEpargne)) + " sous l'objectif";
      epargneHint.className = "kpi-hint " + (diffEpargne >= 0 ? "positive" : "negative");
    }
  } else {
    if (epargneHint) epargneHint.textContent = "Renseigner epargne_reelle_mensuelle";
  }

  // Highlight impôts
  const moisActuel = new Date().getMonth();
  ["impotSept","impotOct","impotNov","impotDec"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    const moisImpot = 8 + i;
    if (moisActuel > moisImpot) el.classList.add("impot-paye");
    else if (moisActuel === moisImpot) el.classList.add("impot-courant");
  });

  // Sync badge
  const upd    = new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" });
  const uptime = new Date().toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
  setText("lastUpdate", upd + " – " + uptime);

  // Goals
  renderGoals(data, netNum || (last ?? 0), peaNum);
  
// Projection
window._projArgs = [netNum, peaNum, v1, v2, d1, d2];
renderProjection(netNum, peaNum, v1, v2, d1, d2);

  hideSkeleton();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadHistorique();

  if (wealthData.length < 2) {
    document.querySelector(".chart-wrap").innerHTML = `
      <div class="chart-placeholder">
        <span>📈</span>
        <p>Historique en cours de construction</p>
        <small>Le graphique s'affichera dès le deuxième point enregistré</small>
      </div>
    `;
  } else {
    initWealthChart();
  }

  if (peaData_hist.length < 2) {
    document.getElementById("peaChartWrap").innerHTML = `
      <div class="chart-placeholder">
        <span>📈</span>
        <p>Historique en cours de construction</p>
        <small>Le graphique s'affichera dès le deuxième point enregistré</small>
      </div>
    `;
  const badge = document.getElementById("peaChartBadge");
  if (badge) badge.style.display = "none";
  
  } else {
    const canvas = document.getElementById("peaChart");
    const ctx    = canvas.getContext("2d");
    const grad   = ctx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, "rgba(52,211,153,.18)");
    grad.addColorStop(1, "rgba(52,211,153,0)");
    new Chart(canvas, {
      type: "line",
      data: {
        labels: peaLabels_hist,
        datasets: [{
          label: "Valeur PEA",
          data: peaData_hist,
          borderColor: "#34d399",
          backgroundColor: grad,
          fill: true,
          tension: .42,
          pointRadius: 4,
          pointBackgroundColor: "#34d399",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          borderWidth: 2.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => fmtEur.format(ctx.parsed.y) } }
        },
        scales: {
          x: { grid:{ display:false }, ticks:{ color:"#9aa0b4", font:{ size:11 } } },
          y: { grid:{ color:"rgba(0,0,0,.04)" }, ticks:{ color:"#9aa0b4", font:{ size:11 }, callback: v => fmtEur.format(v) } }
        }
      }
    });
    const badge = document.getElementById("peaChartBadge");
    if (badge) badge.style.display = "none";
  }

  loadSheetData();
}

init();

// ── Refresh ───────────────────────────────────────────────────────────────────
document.getElementById("refreshBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("refreshBtn");
  btn.classList.add("spinning");
  await loadHistorique();
  await loadSheetData();
  setTimeout(() => btn.classList.remove("spinning"), 600);
});

document.querySelectorAll(".range-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const range = btn.dataset.range === "all" ? "all" : parseInt(btn.dataset.range);
    renderWealthChart(range);
  });
});

// ── Tableaux d'amortissement ──────────────────────────────────────────────────
// Kilford : taux 1.14%, 300 mois, départ sept 2021, capital initial 423451.52
function getKilfordCapital(moisDepuisDebut) {
  if (moisDepuisDebut < 1 || moisDepuisDebut > 300) return 0;
  const tauxMensuel = 0.0114 / 12;
  const n = 300;
  const mensualite = 1623.24;
  const capitalInitial = 423451.52;
  // Capital restant avant l'échéance N
  const capitalRestant = capitalInitial * Math.pow(1 + tauxMensuel, moisDepuisDebut - 1) -
    mensualite * (Math.pow(1 + tauxMensuel, moisDepuisDebut - 1) - 1) / tauxMensuel;
    const interets = capitalRestant * tauxMensuel;
  return mensualite - interets;
}

// La Turbie : taux 3.15%, 300 mois, départ juin 2026, capital initial 432000
function getTurbieCapital(moisDepuisDebut) {
  if (moisDepuisDebut < 1 || moisDepuisDebut > 300) return 0;
  const tauxMensuel = 0.0315 / 12;
  const mensualite = 2082.46;
  const capitalInitial = 432000;
  const capitalRestant = capitalInitial * Math.pow(1 + tauxMensuel, moisDepuisDebut - 1) -
    mensualite * (Math.pow(1 + tauxMensuel, moisDepuisDebut - 1) - 1) / tauxMensuel;
    const interets = capitalRestant * tauxMensuel;
  return mensualite - interets;
}

// ── Moteur de projection ──────────────────────────────────────────────────────
let projChart;
let currentHorizon = 10;

function computeProjection(netActuel, peaActuel, immo1Actuel, immo2Actuel, dettes1Actuel, dettes2Actuel, horizon) {
  const scenarios = [
    { immo1: 0.00, immo2: 0.01, pea: 0.05 }, // pessimiste
    { immo1: 0.015, immo2: 0.02, pea: 0.07 }, // neutre
    { immo1: 0.03, immo2: 0.03, pea: 0.09 }  // optimiste
  ];

  const debutKilford  = new Date(2021, 8, 1); // sept 2021
  const debutTurbie   = new Date(2026, 5, 1); // juin 2026
  const today         = new Date();
  const cashflowMens  = -521;
  const epargneMens   = 1000;
  const peaDCA        = 200;
  const moisTotal     = horizon * 12;

  return scenarios.map(sc => {
    let pea   = peaActuel;
    let immo1 = immo1Actuel;
    let immo2 = immo2Actuel;
    let dette1 = dettes1Actuel;
    let dette2 = dettes2Actuel;
    let cash  = 0;

    const points = [];

    for (let m = 0; m < moisTotal; m++) {
      const dateCourante = new Date(today.getFullYear(), today.getMonth() + m, 1);

      // Capital remboursé Kilford
      const moisK = Math.round((dateCourante - debutKilford) / (1000 * 60 * 60 * 24 * 30.44));
      const capK  = moisK > 0 && moisK <= 300 ? getKilfordCapital(moisK) : 0;
      dette1 = Math.max(0, dette1 - capK);

      // Capital remboursé La Turbie
      const moisT = Math.round((dateCourante - debutTurbie) / (1000 * 60 * 60 * 24 * 30.44));
      const capT  = moisT > 0 && moisT <= 300 ? getTurbieCapital(moisT) : 0;
      dette2 = Math.max(0, dette2 - capT);

      // Revalorisation immo mensuelle
      immo1 *= (1 + sc.immo1 / 12);
      immo2 *= (1 + sc.immo2 / 12);

      // PEA : DCA + performance
      pea = pea * (1 + sc.pea / 12) + peaDCA;

      // Cash : épargne + cashflow Kilford
      cash += epargneMens + cashflowMens;

      // Patrimoine net
      const net = (immo1 - dette1) + (immo2 - dette2) + pea + cash;

      if (m % 12 === 11 || m === moisTotal - 1) {
        points.push({ annee: Math.ceil((m + 1) / 12), net: Math.round(net) });
      }
    }
    return points;
  });
}

function renderProjection(netActuel, peaActuel, immo1Actuel, immo2Actuel, dettes1Actuel, dettes2Actuel) {
  const horizon   = currentHorizon;
  const scenarios = computeProjection(netActuel, peaActuel, immo1Actuel, immo2Actuel, dettes1Actuel, dettes2Actuel, horizon);

  const labels = scenarios[0].map(p => "An " + p.annee);

  // Valeurs finales
  setText("projPessimiste", fmtEur.format(scenarios[0][scenarios[0].length - 1].net));
  setText("projNeutre",     fmtEur.format(scenarios[1][scenarios[1].length - 1].net));
  setText("projOptimiste",  fmtEur.format(scenarios[2][scenarios[2].length - 1].net));

  // Milestones
  const milestones = [Math.floor(horizon * 0.25), Math.floor(horizon * 0.5), Math.floor(horizon * 0.75), horizon - 1];
  const milestonesEl = document.getElementById("projMilestones");
  if (milestonesEl) {
    milestonesEl.innerHTML = milestones.map(idx => {
      const annee = scenarios[0][idx]?.annee || "";
      return `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Dans ${annee} ans</div>
          <div style="font-size:12px;color:var(--red);font-weight:600">${fmtEur.format(scenarios[0][idx]?.net || 0)}</div>
          <div style="font-size:12px;color:var(--blue);font-weight:600">${fmtEur.format(scenarios[1][idx]?.net || 0)}</div>
          <div style="font-size:12px;color:var(--green);font-weight:600">${fmtEur.format(scenarios[2][idx]?.net || 0)}</div>
        </div>
      `;
    }).join("");
  }

  // Graphique
  if (projChart) projChart.destroy();
  const canvas = document.getElementById("projChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  projChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Pessimiste",
          data: scenarios[0].map(p => p.net),
          borderColor: "#e53e3e",
          backgroundColor: "rgba(229,62,62,.06)",
          fill: true,
          tension: .42,
          pointRadius: 3,
          borderWidth: 2
        },
        {
          label: "Neutre",
          data: scenarios[1].map(p => p.net),
          borderColor: "#4f6ef7",
          backgroundColor: "rgba(79,110,247,.06)",
          fill: true,
          tension: .42,
          pointRadius: 3,
          borderWidth: 2.5
        },
        {
          label: "Optimiste",
          data: scenarios[2].map(p => p.net),
          borderColor: "#0e9f6e",
          backgroundColor: "rgba(14,159,110,.06)",
          fill: true,
          tension: .42,
          pointRadius: 3,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "top", labels: { font: { size: 11 }, color: "#9aa0b4" } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label + " : " + fmtEur.format(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#9aa0b4", font: { size: 11 } } },
        y: { grid: { color: "rgba(0,0,0,.04)" }, ticks: { color: "#9aa0b4", font: { size: 11 }, callback: v => fmtEur.format(v) } }
      }
    }
  });
}

// Boutons horizon
document.querySelectorAll("[data-horizon]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-horizon]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentHorizon = parseInt(btn.dataset.horizon);
    if (window._projArgs) renderProjection(...window._projArgs);
  });
});

// ── Simulateur salaire ────────────────────────────────────────────────────────
function updateSimulateur(nbGardes) {
  const brut      = 7443 + nbGardes * 461;
  const net       = Math.round(brut * 0.92);
  const provision = Math.round(net * 0.15);
  const reste = net - provision;

  const fmtS = new Intl.NumberFormat("fr-FR", { style:"currency", currency:"EUR", maximumFractionDigits:0 });

  document.getElementById("simNbGardes").textContent  = nbGardes + (nbGardes > 1 ? " gardes" : " garde");
  document.getElementById("simBrut").textContent      = fmtS.format(brut);
  document.getElementById("simNet").textContent       = fmtS.format(net);
  document.getElementById("simProvision").textContent = "-" + fmtS.format(provision);

  const resteEl = document.getElementById("simReste");
  if (resteEl) {
    resteEl.textContent = (reste >= 0 ? "+" : "") + fmtS.format(reste);
    resteEl.classList.toggle("positive", reste >= 0);
    resteEl.classList.toggle("negative", reste < 0);
  }
}

const slider = document.getElementById("simGardesSlider");
if (slider) {
  slider.addEventListener("input", () => updateSimulateur(parseInt(slider.value)));
  updateSimulateur(0);
}

// ── Trésorerie ────────────────────────────────────────────────────────────────
const TOTAL_CHARGES = 2857 + 226 + 1311; // CCF + CE + Bourso
const SALAIRE_HARMONIE = 2400;

function updateTresorerie(nbGardes) {
  const brut      = 7443 + nbGardes * 461;
  const netVous   = Math.round(brut * 0.92);
  const provision = Math.round(netVous * 0.15);
  const totalFoyer = netVous + SALAIRE_HARMONIE;

  const ratioVous    = netVous / totalFoyer;
  const ratioHarmonie = SALAIRE_HARMONIE / totalFoyer;

  const partVous    = Math.round(TOTAL_CHARGES * ratioVous);
  const partHarmonie = Math.round(TOTAL_CHARGES * ratioHarmonie);

  const totalVousVirement = partVous;

  const fmtT = new Intl.NumberFormat("fr-FR", { style:"currency", currency:"EUR", maximumFractionDigits:0 });

  // Simulateur
  const nbGardesEl = document.getElementById("tresoNbGardes");
  if (nbGardesEl) nbGardesEl.textContent = nbGardes + (nbGardes > 1 ? " gardes" : " garde");
  setText("tresoSalaireVous",  "+" + fmtT.format(netVous));
  setText("tresoProvision",    "-" + fmtT.format(provision));
  setText("tresoTotalRevenus", fmtT.format(netVous + SALAIRE_HARMONIE + 513 + 1419 - provision));
  setText("tresoTotalFoyer",   Math.round(ratioVous * 100) + "% vous · " + Math.round(ratioHarmonie * 100) + "% Harmonie");
  setText("tresoTotalCCF",     fmtT.format(TOTAL_CHARGES));

  // Provision Bourso+
  setText("tresoVirBoursoPlus", "+" + fmtT.format(provision));

  // Récap virements
  setText("recapVousCCF",        fmtT.format(partVous));
  setText("recapVousBoursoPlus", fmtT.format(provision));
  setText("recapVousTotal",      fmtT.format(totalVousVirement));
  setText("recapHarmonieCCF",    fmtT.format(partHarmonie));
  setText("recapHarmonieTotal",  fmtT.format(partHarmonie));
}

const tresoSlider = document.getElementById("tresoGardesSlider");
if (tresoSlider) {
  tresoSlider.addEventListener("input", () => updateTresorerie(parseInt(tresoSlider.value)));
  updateTresorerie(0);
}

lucide.createIcons();
