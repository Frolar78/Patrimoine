// ── Lock screen ───────────────────────────────────────────────────────────────
(function() {
  const PASSWORD = "Ell@30092021"; // ← changez ici
  const SESSION_KEY = "mp_unlocked";
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
let ctoData_hist = [];
let ctoLabels_hist = [];
let cashData_hist = [];
let cashLabels_hist = [];
let currentCashRange = 12;
let currentNbGardes = 0;

// Paramètres salaire — pilotés par Web_Data (valeurs par défaut = ancien code en dur)
let SAL = { brutBase: 7518, garde: 461, charges: 716, provision: 0.15, harmonie: 2500 };

async function loadHistorique() {
  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-CBoyk52n52AhBbdKFFRTsUT3Dp1XVlg3BxL_QRZV682ToOlotYHwumcxSHH1YHuuJKyae99Ll1c3/pub?gid=1865808494&single=true&output=csv";
  try {
    const res = await fetch(url);
    const csv = await res.text();
    const rows = parseCSV(csv.trim()).slice(1).filter(r => r[0]);

// Un point par mois uniquement — on garde le dernier point de chaque mois
    const parMois = {};
    rows.forEach(r => {
      const parts = r[0].split(" ")[0].split("/");
      const d = new Date(parts[2], parts[1]-1, parts[0]);
      const key = d.getFullYear() + "-" + d.getMonth();
      parMois[key] = { val: parseNum(r[3]), date: d };
    });
    
    wealthData   = Object.values(parMois).map(p => p.val);
    wealthLabels = Object.values(parMois).map(p =>
      p.date.toLocaleDateString("fr-FR", { month:"short", year:"2-digit" })
    );

 // PEA — un point par mois
const parMoisPea = {};
rows.forEach(r => {
  if (!parseNum(r[5] || "")) return;
  const parts = r[0].split(" ")[0].split("/");
  const d = new Date(parts[2], parts[1]-1, parts[0]);
  const key = d.getFullYear() + "-" + d.getMonth();
  parMoisPea[key] = { val: parseNum(r[5]), date: d };
});
peaData_hist   = Object.values(parMoisPea).map(p => p.val);
peaLabels_hist = Object.values(parMoisPea).map(p =>
  p.date.toLocaleDateString("fr-FR", { month:"short", year:"2-digit" })
);

// CTO — un point par mois
const parMoisCto = {};
rows.forEach(r => {
  if (!parseNum(r[11] || "")) return;
  const parts = r[0].split(" ")[0].split("/");
  const d = new Date(parts[2], parts[1]-1, parts[0]);
  const key = d.getFullYear() + "-" + d.getMonth();
  parMoisCto[key] = { val: parseNum(r[11]), date: d };
});
ctoData_hist   = Object.values(parMoisCto).map(p => p.val);
ctoLabels_hist = Object.values(parMoisCto).map(p =>
  p.date.toLocaleDateString("fr-FR", { month:"short", year:"2-digit" })
);

// Cash — un point par mois
const parMoisCash = {};
rows.forEach(r => {
  if (!parseNum(r[6] || "")) return;
  const parts = r[0].split(" ")[0].split("/");
  const d = new Date(parts[2], parts[1]-1, parts[0]);
  const key = d.getFullYear() + "-" + d.getMonth();
  parMoisCash[key] = { val: parseNum(r[6]), date: d };
});
cashData_hist   = Object.values(parMoisCash).map(p => p.val);
cashLabels_hist = Object.values(parMoisCash).map(p =>
  p.date.toLocaleDateString("fr-FR", { month:"short", year:"2-digit" })
);

  } catch(e) {
    console.warn("Historique indisponible", e);
    wealthData   = [];
    wealthLabels = [];
  }
}

let wealthChart;
let currentRange = 12;
let currentPeaRange = 12;
let currentCtoRange = 12;

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
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: ctx => ctx.label + " : " + ctx.parsed.toFixed(1) + " %"
                  }
                }
              }
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
        <div class="goal-bar"><span style="width:0%" data-pct="${g.pct}"></span></div>
        <div class="goal-card-pct" data-pct="${g.pct}">0 %</div>
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
        <div class="goal-full-bar"><span style="width:0%" data-pct="${g.pct}"></span></div>
        <div class="goal-full-pct" data-pct="${g.pct}">0 %</div>
      </div>
    `).join("");
}

  // Animation compteur et barres
  setTimeout(() => {
    document.querySelectorAll(".goal-bar span[data-pct], .goal-full-bar span[data-pct]").forEach(bar => {
      const pct = parseInt(bar.dataset.pct);
      bar.style.width = pct + "%";
      const hue = Math.round(200 + (pct / 100) * 60);
      bar.style.background = `linear-gradient(90deg, hsl(${hue}, 85%, 55%), hsl(${hue + 40}, 85%, 60%))`;
    });

    document.querySelectorAll(".goal-card-pct[data-pct], .goal-full-pct[data-pct]").forEach(el => {
      const target = parseInt(el.dataset.pct);
      let current = 0;
      const step = Math.max(1, Math.round(target / 40));
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current + " %";
        if (current >= target) clearInterval(timer);
      }, 30);
    });
  }, 100);
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

  // Paramètres salaire depuis Web_Data (fallback sur valeurs par défaut)
  SAL = {
    brutBase:  parseNum(data.salaire_brut_base)     || SAL.brutBase,
    garde:     parseNum(data.salaire_montant_garde) || SAL.garde,
    charges:   parseNum(data.salaire_charges)       || SAL.charges,
    provision: parseNum(data.salaire_taux_provision)|| SAL.provision,
    harmonie:  parseNum(data.salaire_harmonie)      || SAL.harmonie
  };

  // Charger Flux_Mensuels puis rafraîchir les vues (SAL + FLUX prêts)
  await loadFluxMensuels();
  try {
    const _tg = document.getElementById("tresoGardesSlider");
    updateTresorerie(_tg ? parseInt(_tg.value) || 0 : currentNbGardes);
    const _sg = document.getElementById("simGardesSlider");
    if (_sg) updateSimulateur(parseInt(_sg.value) || 0);
  } catch (e) { console.warn("rerender treso:", e); }

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
  const brutNum     = parseNum(data.patrimoine_brut);
  const allocImmo   = parsePercent(data.allocation_immobilier);
  const allocPea    = parsePercent(data.allocation_pea);
  const allocCash   = parsePercent(data.allocation_cash);
  const pctBrutImmo = brutNum ? ((immoBrutNum / brutNum) * 100).toFixed(1) : "--";
  const pctBrutPea  = brutNum ? ((peaNum      / brutNum) * 100).toFixed(1) : "--";
  const pctBrutCash = brutNum ? ((cashNum     / brutNum) * 100).toFixed(1) : "--";

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
  document.getElementById("varMensuelleKpi")?.classList.toggle("negative", !pos);
  document.getElementById("varMensuelleKpi")?.classList.toggle("positive",  pos);
  document.getElementById("varMensuellePctKpi")?.classList.toggle("negative", !pos);
  document.getElementById("varMensuellePctKpi")?.classList.toggle("positive",  pos);
  setText("variationPct",       pctFmt);
  setText("perfYtd", ytdText);

  // Allocation donut + légende
  setText("allocImmoText", allocImmo + " %");
  setText("allocPeaText",  allocPea  + " %");
  setText("allocCashText", allocCash + " %");
  setText("allocImmoVal",  immoNetNum ? fmtEur.format(immoNetNum) : "--");
  setText("allocPeaVal",   data.pea_valeur      || "--");
  setText("allocCashVal",  data.cash_disponible || "--");
  initAllocChart(allocImmo, allocPea, allocCash);

  // Tableau détail
  setText("dtImmoVal",     immoBrutNum ? fmtEur.format(immoBrutNum) : "--");
  setText("dtImmoPctBrut", pctBrutImmo + " %");
  setText("dtImmoPctNet",  pctNetImmo);
  const immoEvo = parseNum(data.immo_evo_mensuelle);
const immoEvoEl = document.getElementById("dtImmoEvo");
if (immoEvoEl) {
  immoEvoEl.textContent = immoEvo ? (immoEvo >= 0 ? "+" : "") + fmtEur.format(immoEvo) : "—";
  immoEvoEl.classList.toggle("positive", immoEvo >= 0);
  immoEvoEl.classList.toggle("negative", immoEvo < 0);
}
  setText("dtPeaVal",      data.pea_valeur || "--");
  setText("dtPeaPctBrut",  pctBrutPea  + " %");
  setText("dtPeaPctNet",   pctNetPea);
  const peaEvo = parseNum(data.pea_evo_mensuelle);
const peaEvoEl = document.getElementById("dtPeaEvo");
if (peaEvoEl) {
  peaEvoEl.textContent = peaEvo ? (peaEvo >= 0 ? "+" : "") + fmtEur.format(peaEvo) : "—";
  peaEvoEl.classList.toggle("positive", peaEvo >= 0);
  peaEvoEl.classList.toggle("negative", peaEvo < 0);
}
  setText("dtCashVal",     data.cash_disponible || "--");
  setText("dtCashPctBrut", pctBrutCash + " %");
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
        { initial: 423451.52, debut: new Date(2021, 8, 1), mensualites: 300, dette: d1, id: "1" },
    { initial: 432000, debut: new Date(2026, 5, 1), mensualites: 300, dette: d2, id: "2" }
  ];

  credits.forEach(c => {
    const today        = new Date();
    const moisEcoules  = Math.max(0, (today.getFullYear() - c.debut.getFullYear()) * 12 + (today.getMonth() - c.debut.getMonth()) + 1);
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
  
// ── CTO Enfants ───────────────────────────────────────────────────────────
  const ctoValeur  = parseNum(data.cto_valeur);
  const ctoVerse   = parseNum(data.cto_verse);
  const ctoPvBrute = ctoValeur - ctoVerse;
  const ctoPvNette = ctoPvBrute * 0.70;
  const ctoPerfVal = ctoVerse ? ((ctoValeur - ctoVerse) / ctoVerse * 100) : 0;

  setText("ctoP_valeur",  ctoValeur ? fmtEur.format(ctoValeur) : "--");
  setText("ctoP_verse",   ctoVerse  ? fmtEur.format(ctoVerse)  : "--");
  setText("ctoP_pvBrute", ctoPvBrute ? (ctoPvBrute >= 0 ? "+" : "") + fmtEur.format(ctoPvBrute) : "--");
  setText("ctoP_pvNette", ctoPvNette ? (ctoPvNette >= 0 ? "+" : "") + fmtEur.format(ctoPvNette) + " après flat tax" : "--");
  setText("ctoP_perf",    ctoPerfVal ? (ctoPerfVal >= 0 ? "+" : "") + ctoPerfVal.toFixed(1) + " %" : "--");

  setText("ctoP_actif1Nom",    data.cto_actif1_nom    || "--");
  setText("ctoP_actif1Valeur", data.cto_actif1_valeur || "--");
  setText("ctoP_actif2Nom",    data.cto_actif2_nom    || "--");
  setText("ctoP_actif2Valeur", data.cto_actif2_valeur || "--");
  setText("ctoP_actif3Nom",    data.cto_actif3_nom    || "--");
  setText("ctoP_actif3Valeur", data.cto_actif3_valeur || "--");

  const ctoPerf1 = parsePercent(data.cto_actif1_perf);
  const ctoPerf2 = parsePercent(data.cto_actif2_perf);
  const ctoPerf3 = parsePercent(data.cto_actif3_perf);
  setText("ctoP_actif1Perf", isNaN(ctoPerf1) ? "--" : (ctoPerf1 >= 0 ? "+" : "") + ctoPerf1.toFixed(1) + " %");
  setText("ctoP_actif2Perf", isNaN(ctoPerf2) ? "--" : (ctoPerf2 >= 0 ? "+" : "") + ctoPerf2.toFixed(1) + " %");
  setText("ctoP_actif3Perf", isNaN(ctoPerf3) ? "--" : (ctoPerf3 >= 0 ? "+" : "") + ctoPerf3.toFixed(1) + " %");

  const cto1Num = parseNum(data.cto_actif1_valeur);
  const cto2Num = parseNum(data.cto_actif2_valeur);
  const cto3Num = parseNum(data.cto_actif3_valeur);
  const ctoPct1 = ctoValeur ? Math.round(cto1Num / ctoValeur * 100) : 0;
  const ctoPct2 = ctoValeur ? Math.round(cto2Num / ctoValeur * 100) : 0;
  const ctoPct3 = ctoValeur ? Math.round(cto3Num / ctoValeur * 100) : 0;
  setText("ctoP_actif1Pct",    ctoPct1 + " %");
  setText("ctoP_actif2Pct",    ctoPct2 + " %");
  setText("ctoP_actif3Pct",    ctoPct3 + " %");
  setText("ctoP_actif1PctBar", ctoPct1 + " %");
  setText("ctoP_actif2PctBar", ctoPct2 + " %");
  setText("ctoP_actif3PctBar", ctoPct3 + " %");
  const ctoBar1 = document.getElementById("ctoBar1");
  const ctoBar2 = document.getElementById("ctoBar2");
  const ctoBar3 = document.getElementById("ctoBar3");
  if (ctoBar1) ctoBar1.style.width = ctoPct1 + "%";
  if (ctoBar2) ctoBar2.style.width = ctoPct2 + "%";
  if (ctoBar3) ctoBar3.style.width = ctoPct3 + "%";
  
  // Mini panel CTO overview
  setText("ctoActif1Nom",    data.cto_actif1_nom    || "--");
  setText("ctoActif1Valeur", data.cto_actif1_valeur || "--");
  setText("ctoActif1Perf",   isNaN(ctoPerf1) ? "--" : (ctoPerf1 >= 0 ? "+" : "") + ctoPerf1.toFixed(1) + " %");
  setText("ctoActif2Nom",    data.cto_actif2_nom    || "--");
  setText("ctoActif2Valeur", data.cto_actif2_valeur || "--");
  setText("ctoActif2Perf",   isNaN(ctoPerf2) ? "--" : (ctoPerf2 >= 0 ? "+" : "") + ctoPerf2.toFixed(1) + " %");
  setText("ctoActif3Nom",    data.cto_actif3_nom    || "--");
  setText("ctoActif3Valeur", data.cto_actif3_valeur || "--");
  setText("ctoActif3Perf",   isNaN(ctoPerf3) ? "--" : (ctoPerf3 >= 0 ? "+" : "") + ctoPerf3.toFixed(1) + " %");
  setText("ctoValeurOverview", ctoValeur ? fmtEur.format(ctoValeur) : "--");
  setText("ctoPerfOverview",   ctoPerfVal ? (ctoPerfVal >= 0 ? "+" : "") + ctoPerfVal.toFixed(1) + " %" : "--");
  
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
  const cashEvoMens = parseNum(data.cash_evo_mensuelle);
  const cashEvoPct  = totalLivrets && cashEvoMens ? (cashEvoMens / (totalLivrets - cashEvoMens) * 100) : null;
  const cashEvoKpiEl = document.getElementById("cashP_evo");
  const cashEvoPctKpiEl = document.getElementById("cashP_evoPct");
  const cashTotalEvoEl = document.getElementById("cashTotalEvo");

  if (cashEvoKpiEl) {
    cashEvoKpiEl.textContent = cashEvoMens ? (cashEvoMens >= 0 ? "+" : "") + fmtEur.format(cashEvoMens) : "--";
    cashEvoKpiEl.className = "kpi-sub " + (cashEvoMens >= 0 ? "positive" : "negative");
  }
  if (cashEvoPctKpiEl) {
    cashEvoPctKpiEl.textContent = cashEvoPct !== null ? (cashEvoPct >= 0 ? "+" : "") + cashEvoPct.toFixed(1) + " %" : "--";
    cashEvoPctKpiEl.className = "kpi-hint " + (cashEvoPct >= 0 ? "positive" : "negative");
  }
  if (cashTotalEvoEl) {
    cashTotalEvoEl.textContent = cashEvoMens ? (cashEvoMens >= 0 ? "+" : "") + fmtEur.format(cashEvoMens) : "--";
    cashTotalEvoEl.className = cashEvoMens >= 0 ? "positive" : "negative";
  }

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
  const objectifEpargne = 1000;
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

// Tableau de chasse
  renderTableauChasse();

// Projection
window._projArgs = [netNum, peaNum, v1, v2, d1, d2];
renderProjection(netNum, peaNum, v1, v2, d1, d2);

  hideSkeleton();
}

// ── Graphique PEA ─────────────────────────────────────────────────────────────
let peaChart;
function renderPeaChart(range) {
  currentPeaRange = range;
  const slice  = range === "all" ? peaData_hist  : peaData_hist.slice(-range);
  const labels = range === "all" ? peaLabels_hist : peaLabels_hist.slice(-range);

  if (peaChart) {
    peaChart.data.labels = labels;
    peaChart.data.datasets[0].data = slice;
    peaChart.update();
    return;
  }

  const canvas = document.getElementById("peaChart");
  const ctx    = canvas.getContext("2d");
  const grad   = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, "rgba(52,211,153,.18)");
  grad.addColorStop(1, "rgba(52,211,153,0)");

  peaChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Valeur PEA",
        data: slice,
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
}

// ── Graphique Cash ────────────────────────────────────────────────────────────
let cashChart;
function renderCashChart(range) {
  currentCashRange = range;
  const slice  = range === "all" ? cashData_hist  : cashData_hist.slice(-range);
  const labels = range === "all" ? cashLabels_hist : cashLabels_hist.slice(-range);

  if (cashChart) {
    cashChart.data.labels = labels;
    cashChart.data.datasets[0].data = slice;
    cashChart.update();
    return;
  }

  const canvas = document.getElementById("cashChart");
  if (!canvas) return;
  const ctx  = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, "rgba(245,158,11,.18)");
  grad.addColorStop(1, "rgba(245,158,11,0)");

  cashChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Total livrets",
        data: slice,
        borderColor: "#f59e0b",
        backgroundColor: grad,
        fill: true,
        tension: .42,
        pointRadius: 4,
        pointBackgroundColor: "#f59e0b",
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

// ── Graphique CTO ─────────────────────────────────────────────────────────────
let ctoChart;
function renderCtoChart(range) {
  currentCtoRange = range;
  const slice  = range === "all" ? ctoData_hist  : ctoData_hist.slice(-range);
  const labels = range === "all" ? ctoLabels_hist : ctoLabels_hist.slice(-range);

  if (ctoChart) {
    ctoChart.data.labels = labels;
    ctoChart.data.datasets[0].data = slice;
    ctoChart.update();
    return;
  }

  const canvas = document.getElementById("ctoChart");
  const ctx    = canvas.getContext("2d");
  const grad   = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, "rgba(245,158,11,.18)");
  grad.addColorStop(1, "rgba(245,158,11,0)");

  ctoChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Valeur CTO",
        data: slice,
        borderColor: "#f59e0b",
        backgroundColor: grad,
        fill: true,
        tension: .42,
        pointRadius: 4,
        pointBackgroundColor: "#f59e0b",
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

// ── Tableau de chasse ─────────────────────────────────────────────────────────
function renderTableauChasse() {
  const el = document.getElementById("tableauChasse");
  if (!el || wealthData.length < 2) return;

  // Calcul des variations mensuelles
  const variations = [];
  for (let i = 1; i < wealthData.length; i++) {
    if (wealthData[i] && wealthData[i-1]) {
      variations.push({ diff: wealthData[i] - wealthData[i-1], label: wealthLabels[i] });
    }
  }

  // Meilleur mois
  const meilleurMois = variations.reduce((best, v) => v.diff > best.diff ? v : best, variations[0]);

  // Record patrimoine
  const recordIdx = wealthData.reduce((maxIdx, v, i) => v > wealthData[maxIdx] ? i : maxIdx, 0);
  const recordVal = wealthData[recordIdx];
  const recordLabel = wealthLabels[recordIdx];

  // Progression totale
  const premier = wealthData.find(v => v !== 0);
  const dernier = wealthData[wealthData.length - 1];
  const progression = dernier - premier;

  // Mois positifs
  const moisPositifs = variations.filter(v => v.diff > 0).length;
  const totalMois = variations.length;

  // Moyenne mensuelle
  const moyenne = variations.reduce((sum, v) => sum + v.diff, 0) / totalMois;

  const rows = [
    {
      icon: "trophy",
      color: "#f0a500",
      label: "Meilleur mois",
      value: (meilleurMois.diff >= 0 ? "+" : "") + fmtEur.format(Math.round(meilleurMois.diff)),
      sub: meilleurMois.label
    },
    {
      icon: "crown",
      color: "#6366f1",
      label: "Record patrimoine net",
      value: fmtEur.format(Math.round(recordVal)),
      sub: recordLabel
    },
    {
      icon: "rocket",
      color: "#0e9f6e",
      label: "Progression totale",
      value: (progression >= 0 ? "+" : "") + fmtEur.format(Math.round(progression)),
      sub: "depuis " + wealthLabels[0]
    },
    {
      icon: "calendar-check",
      color: "#4f6ef7",
      label: "Mois positifs",
      value: moisPositifs + " / " + totalMois,
      sub: Math.round(moisPositifs / totalMois * 100) + "% du temps"
    },
    {
      icon: "trending-up",
      color: "#10b981",
      label: "Progression moyenne",
      value: (moyenne >= 0 ? "+" : "") + fmtEur.format(Math.round(moyenne)) + "/mois",
      sub: "sur " + totalMois + " mois"
    }
  ];

  el.innerHTML = rows.map((r, i) => `
    <div style="
      display:flex;
      align-items:center;
      gap:16px;
      padding:14px 0;
      ${i < rows.length - 1 ? "border-bottom:1px solid var(--border);" : ""}
    ">
      <div style="
        width:38px;height:38px;
        border-radius:12px;
        background:${r.color}18;
        border:1px solid ${r.color}44;
        display:flex;align-items:center;justify-content:center;
        flex-shrink:0;
        color:${r.color};
      ">
        <i data-lucide="${r.icon}" style="width:18px;height:18px;stroke-width:1.8"></i>
      </div>
      <div style="flex:1">
        <div style="font-size:12px;color:var(--text2);margin-bottom:2px">${r.label}</div>
        <div style="font-size:11px;color:var(--text3)">${r.sub}</div>
      </div>
      <div style="font-family:'DM Serif Display',serif;font-size:18px;color:var(--text);text-align:right">
        ${r.value}
      </div>
    </div>
  `).join("");

  lucide.createIcons();
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
    renderPeaChart(12);
    const badge = document.getElementById("peaChartBadge");
    if (badge) badge.style.display = "none";
  }

  // Graphique Cash
  if (cashData_hist.length < 2) {
    const cashWrap = document.getElementById("cashChartWrap");
    if (cashWrap) cashWrap.innerHTML = `
      <div class="chart-placeholder">
        <span>📈</span>
        <p>Historique en cours de construction</p>
        <small>Le graphique s'affichera dès le deuxième point enregistré</small>
      </div>
    `;
  } else {
    renderCashChart(12);
  }

  // Graphique CTO
  if (ctoData_hist.length < 2) {
    const ctoWrap = document.getElementById("ctoChartWrap");
    if (ctoWrap) ctoWrap.innerHTML = `
      <div class="chart-placeholder">
        <span>📈</span>
        <p>Historique en cours de construction</p>
        <small>Le graphique s'affichera dès le deuxième point enregistré</small>
      </div>
    `;
  } else {
    renderCtoChart(12);
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

document.querySelectorAll(".range-btn-cash").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn-cash").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const range = btn.dataset.range === "all" ? "all" : parseInt(btn.dataset.range);
    renderCashChart(range);
  });
});

// ── Taux d'effort ─────────────────────────────────────────────────────────────
function updateTauxEffort() {
  const brut    = SAL.brutBase + currentNbGardes * SAL.garde;
  const net = brut - SAL.charges;
  const revenusFoyer = net + SAL.harmonie;
  const mensualites  = 1623 + 2082;
  const taux = (mensualites / revenusFoyer * 100);

  const el = document.getElementById("tauxEffortVal");
  const hint = document.getElementById("tauxEffortHint");
  if (!el) return;

  el.textContent = taux.toFixed(1) + " %";
  if (taux <= 35) {
    el.className = "kpi-value positive";
    if (hint) { hint.textContent = "✅ Dans les normes bancaires"; hint.className = "kpi-hint positive"; }
  } else if (taux <= 40) {
    el.className = "kpi-value";
    el.style.color = "var(--gold)";
    if (hint) { hint.textContent = "⚠️ Limite (norme : 35%)"; hint.className = "kpi-hint"; hint.style.color = "var(--gold)"; }
  } else {
    el.className = "kpi-value negative";
    if (hint) { hint.textContent = "🔴 Au-dessus de 35%"; hint.className = "kpi-hint negative"; }
  }
}

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
  const milestones = [Math.floor(horizon * 0.25), Math.floor(horizon * 0.5), Math.floor(horizon * 0.75)];
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
  const brut      = SAL.brutBase + nbGardes * SAL.garde;
  const net = brut - SAL.charges;
  const provision = Math.round(net * SAL.provision);
  const virCCFSim = Math.ceil(totalCCF * (net / (net + SAL.harmonie)) / 100) * 100;
  const reste = net - provision - virCCFSim;

  const fmtS = new Intl.NumberFormat("fr-FR", { style:"currency", currency:"EUR", maximumFractionDigits:0 });

  document.getElementById("simNbGardes").textContent  = nbGardes + (nbGardes > 1 ? " gardes" : " garde");
  document.getElementById("simBrut").textContent      = fmtS.format(brut);
  document.getElementById("simNet").textContent       = fmtS.format(net);
  document.getElementById("simProvision").textContent = "-" + fmtS.format(provision);
  setText("simVirCCF", "-" + fmtS.format(virCCFSim));

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
}

// ── Trésorerie (pilotée par Flux_Mensuels) ─────────────────────────────────────
let FLUX = [];
let TRESO = { CE:{entrees:[],sorties:[]}, CCF:{entrees:[],sorties:[]}, Bourso:{entrees:[],sorties:[]}, Perso:{entrees:[],sorties:[]} };
let soldeCE = 0, soldeCCF = 0, soldeBourso = 0, soldePerso = 0;
let virCE = 0, virBourso = 0, virPerso = 0, totalCCF = 0;
let donutChart = null;

const COMPTES = [
  { id:"CCF",    nom:"CJ CCF",               tag:"Compte pivot" },
  { id:"CE",     nom:"CJ Caisse d'Épargne",  tag:"Kilford" },
  { id:"Bourso", nom:"CJ BoursoBank",        tag:"Vie courante" },
  { id:"Perso",  nom:"Compte perso",         tag:"Perso" }
];
const DONUT_COLORS = ["#2a78d6","#1baf7a","#eda100","#4a3aa7","#e34948","#e87ba4","#eb6834","#888780","#639922"];

async function loadFluxMensuels() {
  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-CBoyk52n52AhBbdKFFRTsUT3Dp1XVlg3BxL_QRZV682ToOlotYHwumcxSHH1YHuuJKyae99Ll1c3/pub?gid=122326621&single=true&output=csv";
  try {
    const res = await fetch(url);
    const csv = await res.text();
    const rows = parseCSV(csv.trim()).slice(1).filter(r => r[0]);
    FLUX = rows.map(r => ({
      compte:  (r[0] || "").trim(),
      flux:    (r[1] || "").trim(),
      type:    (r[2] || "").trim(),
      cat:     (r[3] || "").trim() || "Divers",
      montant: parseNum(r[4]),
      jour:    (r[5] || "").trim()
    })).filter(f => f.compte && f.montant);
    buildTreso();
  } catch (e) {
    console.warn("loadFluxMensuels:", e);
  }
}

function buildTreso() {
  TRESO = { CE:{entrees:[],sorties:[]}, CCF:{entrees:[],sorties:[]}, Bourso:{entrees:[],sorties:[]}, Perso:{entrees:[],sorties:[]} };
  FLUX.forEach(f => {
    const acc = TRESO[f.compte];
    if (!acc) return;
    const row = { label: f.flux + (f.jour ? " (le " + f.jour + ")" : ""), val: f.montant };
    if (f.montant >= 0) acc.entrees.push(row); else acc.sorties.push(row);
  });
  const sumAcc = c => [...TRESO[c].entrees, ...TRESO[c].sorties].reduce((s, r) => s + r.val, 0);
  soldeCE = sumAcc("CE"); soldeCCF = sumAcc("CCF"); soldeBourso = sumAcc("Bourso"); soldePerso = sumAcc("Perso");
  virCE     = soldeCE     < 0 ? -soldeCE     : 0;
  virBourso = soldeBourso < 0 ? -soldeBourso : 0;
  virPerso  = soldePerso  < 0 ? -soldePerso  : 0;
  totalCCF  = Math.abs(soldeCCF) + virCE + virBourso + virPerso;
}

function soldeDe(id) {
  return id === "CE" ? soldeCE : id === "CCF" ? soldeCCF : id === "Bourso" ? soldeBourso : soldePerso;
}

function updateTresorerie(nbGardes) {
  currentNbGardes = nbGardes;
  const fmtT = new Intl.NumberFormat("fr-FR", { style:"currency", currency:"EUR", maximumFractionDigits:0 });

  const brut      = SAL.brutBase + nbGardes * SAL.garde;
  const netVous   = brut - SAL.charges;
  const provision = Math.round(netVous * SAL.provision);
  const revFlux   = FLUX.filter(f => f.montant > 0).reduce((s, f) => s + f.montant, 0);
  const revenus   = netVous + SAL.harmonie + revFlux;
  const invest    = Math.abs(FLUX.filter(f => f.type === "Investissement").reduce((s, f) => s + f.montant, 0));
  const depFixes  = Math.abs(FLUX.filter(f => f.montant < 0 && f.type !== "Investissement").reduce((s, f) => s + f.montant, 0));
  const capacite  = revenus - depFixes - provision - invest;
  const taux      = revenus > 0 ? Math.round((capacite + invest) / revenus * 100) : 0;

  const nbGardesEl = document.getElementById("tresoNbGardes");
  if (nbGardesEl) nbGardesEl.textContent = nbGardes + (nbGardes > 1 ? " gardes" : " garde");
  updateTauxEffort();

  setText("synthRevenus",   "+" + fmtT.format(revenus));
  setText("synthDepenses",  "-" + fmtT.format(depFixes));
  setText("synthProvision", "-" + fmtT.format(provision));
  setText("synthInvest",    "-" + fmtT.format(invest));
  setText("synthCapacite",  fmtT.format(capacite));
  setText("synthTaux",      taux + " %");

  setText("virCE",     fmtT.format(virCE));
  setText("virBourso", fmtT.format(virBourso));
  setText("virPerso",  fmtT.format(virPerso));

  renderComptes(fmtT);
  renderDonut();
}

function renderComptes(fmtT) {
  const wrap = document.getElementById("comptesDetail");
  if (!wrap) return;
  let html = "";
  COMPTES.forEach(c => {
    const acc = TRESO[c.id] || { entrees:[], sorties:[] };
    const solde = soldeDe(c.id);
    const lignes = [...acc.entrees, ...acc.sorties];
    const inner = lignes.map(r =>
      `<div class="meta-row ${r.val < 0 ? "negative" : ""}"><span>${r.label}</span><span class="${r.val >= 0 ? "positive" : ""}">${r.val >= 0 ? "+" : ""}${fmtT.format(r.val)}</span></div>`
    ).join("");
    const soldeCls = solde >= 0 ? "positive" : "negative";
    html += `<details class="compte-acc">
      <summary>
        <span class="compte-nom">${c.nom}<span class="compte-tag">${c.tag}</span></span>
        <span class="compte-solde ${soldeCls}">${solde >= 0 ? "+" : ""}${fmtT.format(solde)}</span>
      </summary>
      <div class="compte-body">${inner || '<div class="meta-row"><span style="color:var(--text3)">Aucune ligne</span><span></span></div>'}</div>
    </details>`;
  });
  wrap.innerHTML = html;
}

function renderDonut() {
  const canvas = document.getElementById("tresoDonut");
  const fmtT = new Intl.NumberFormat("fr-FR", { style:"currency", currency:"EUR", maximumFractionDigits:0 });
  const cats = {};
  FLUX.filter(f => f.montant < 0 && f.type !== "Investissement").forEach(f => {
    cats[f.cat] = (cats[f.cat] || 0) + Math.abs(f.montant);
  });
  const entries = Object.entries(cats).sort((a, b) => b[1] - a[1]);

  const leg = document.getElementById("donutLegend");
  if (leg) leg.innerHTML = entries.map((e, i) =>
    `<span class="leg-item"><span class="leg-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>${e[0]} ${fmtT.format(e[1])}</span>`
  ).join("");

  if (!canvas || typeof Chart === "undefined") return;
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: entries.map((e, i) => DONUT_COLORS[i % DONUT_COLORS.length]), borderWidth: 2, borderColor: "#fff" }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => " " + fmtT.format(ctx.parsed) } } } }
  });
}

const tresoSlider = document.getElementById("tresoGardesSlider");
if (tresoSlider) {
  tresoSlider.addEventListener("input", () => updateTresorerie(parseInt(tresoSlider.value)));
}
updateTresorerie(0);

if (slider) updateSimulateur(0);

document.querySelectorAll(".range-btn-pea").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn-pea").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const range = btn.dataset.range === "all" ? "all" : parseInt(btn.dataset.range);
    renderPeaChart(range);
  });
});

document.querySelectorAll(".range-btn-cto").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn-cto").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const range = btn.dataset.range === "all" ? "all" : parseInt(btn.dataset.range);
    renderCtoChart(range);
  });
});

lucide.createIcons();
