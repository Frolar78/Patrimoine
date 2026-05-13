// ── Theme toggle ──────────────────────────────────────────────────────────────
const html = document.documentElement;
const themeBtn = document.getElementById("themeToggle");

if (localStorage.getItem("theme") === "dark") html.setAttribute("data-theme", "dark");

themeBtn.addEventListener("click", () => {
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  localStorage.setItem("theme", isDark ? "light" : "dark");
});

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
  return parseFloat(val.toString().replace(/"/g,"").replace(/%/g,"").replace(/\s/g,"").replace(",",".").trim()) || 0;
}

function parsePercent(val) { return parseNum(val); }

// ── Navigation ────────────────────────────────────────────────────────────────
const navLinks   = document.querySelectorAll(".nav-link");
const mobileBtns = document.querySelectorAll(".mobile-btn");
const pages      = document.querySelectorAll(".page");

function switchPage(page) {
  pages.forEach(p => p.classList.remove("active-page"));
  document.getElementById(page + "Page").classList.add("active-page");
  navLinks.forEach(l => l.classList.remove("active"));
  mobileBtns.forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add("active"));
}

[...navLinks, ...mobileBtns, ...document.querySelectorAll(".see-more")].forEach(el => {
  el.addEventListener("click", e => { e.preventDefault(); switchPage(el.dataset.page); });
});

// ── Wealth chart ──────────────────────────────────────────────────────────────
const wealthData = [
  44000, 45500, 47100, 48900,
  50300, 52100, 53800, 55200,
  57300, 59000, 59741, 62172
];

function initWealthChart() {
  const canvas = document.getElementById("wealthChart");
  const ctx    = canvas.getContext("2d");
  const grad   = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, "rgba(79,110,247,.18)");
  grad.addColorStop(1, "rgba(79,110,247,0)");

  new Chart(canvas, {
    type: "line",
    data: {
      labels: ["Juin","Juil","Août","Sept","Oct","Nov","Déc","Jan","Fév","Mars","Avr","Mai"],
      datasets: [{
        label: "Patrimoine net",
        data: wealthData,
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
        backgroundColor: ["#1a1a2e","#4f6ef7","#f0a500"],
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
function renderGoals(data, currentNet) {
  const defaultGoals = [
    { label:"Patrimoine net 100 000 €", target:100000 },
    { label:"Patrimoine net 250 000 €", target:250000 },
    { label:"Patrimoine net 500 000 €", target:500000 },
    { label:"Indépendance financière",  target:1000000 }
  ];

  const goals = defaultGoals.map((g, i) => {
    const label   = data[`goal${i+1}_label`]   || g.label;
    const target  = data[`goal${i+1}_target`]  ? parseNum(data[`goal${i+1}_target`])  : g.target;
    const current = data[`goal${i+1}_current`] ? parseNum(data[`goal${i+1}_current`]) : currentNet;
    const pct     = Math.min(100, Math.round(current / target * 100));
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
  document.querySelectorAll(".kpi-value, .asset-value").forEach(el => {
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

  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ7tkMrE-yzrCTzOYeDkOdTNU8vHSsCGtVaLUDrv8ZyTtSa44d8cSeLNaTjw6CPdg/pub?gid=512150963&single=true&output=csv";

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
  rows.slice(1).forEach(r => { if (r[0]) data[r[0]] = r[1] ?? ""; });
  console.log("Sheet:", data);

  // ── Valeurs numériques de base ────────────────────────────────────────────
  const brutNum = parseNum((data.patrimoine_brut || "").replace(/[^\d.-]/g,""));
  const netNum  = parseNum((data.patrimoine_net  || "").replace(/[^\d.-]/g,""));
  const v1 = parseNum((data.immo_bien1_valeur||"").replace(/[^\d.-]/g,""));
  const d1 = parseNum((data.immo_bien1_dette ||"").replace(/[^\d.-]/g,""));
  const v2 = parseNum((data.immo_bien2_valeur||"").replace(/[^\d.-]/g,""));
  const d2 = parseNum((data.immo_bien2_dette ||"").replace(/[^\d.-]/g,""));
  const peaNum  = parseNum((data.pea_valeur       ||"").replace(/[^\d.-]/g,""));
  const cashNum = parseNum((data.cash_disponible  ||"").replace(/[^\d.-]/g,""));

  // ── Variation mensuelle ───────────────────────────────────────────────────
  const last = wealthData[wealthData.length - 1];
  const prev = wealthData[wealthData.length - 2];
  const diff = data.variation_mensuelle ? parseNum(data.variation_mensuelle) : last - prev;
  const pos  = diff >= 0;
  const diffFmt = (pos ? "+" : "") + fmtEur.format(diff);
  const pctMens = prev ? (diff / prev * 100) : 0;
  const pctFmt  = (pos ? "+" : "") + pctMens.toFixed(2) + " %";

  // ── Allocation ────────────────────────────────────────────────────────────
  const allocImmo = parsePercent(data.allocation_immobilier);
  const allocPea  = parsePercent(data.allocation_pea);
  const allocCash = parsePercent(data.allocation_cash);

  // ── % net calculés : valeur actif / patrimoine net ────────────────────────
  const pctNetImmo  = brutNum ? (((v1 + v2) / brutNum) * 100).toFixed(1) + " %" : "--";
  const pctNetPea   = brutNum ? ((peaNum  / brutNum) * 100).toFixed(1) + " %" : "--";
  const pctNetCash  = brutNum ? ((cashNum / brutNum) * 100).toFixed(1) + " %" : "--";
  const pctNetTotal = "100,0 %";

  // ── PEA perf ──────────────────────────────────────────────────────────────
  const peaPerf = parsePercent(data.pea_performance);
  const peaPerfText = isNaN(peaPerf) || peaPerf === 0 ? "--" : peaPerf.toFixed(1) + " %";

  // ── YTD ───────────────────────────────────────────────────────────────────
  // Priorité : clé perf_ytd dédiée, sinon calculé sur wealthData jan→mai
  let ytdText = "--";
  if (data.perf_ytd) {
    ytdText = "+" + parseNum(data.perf_ytd).toFixed(1) + " %";
  } else {
    // Jan = index 7 dans le tableau (Déc=6, Jan=7)
    const janVal = wealthData[7];
    const mayVal = wealthData[wealthData.length - 1];
    if (janVal) {
      const ytdPct = ((mayVal - janVal) / janVal * 100);
      ytdText = (ytdPct >= 0 ? "+" : "") + ytdPct.toFixed(1) + " %";
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MISE À JOUR DOM
  // ════════════════════════════════════════════════════════════════════════════

  // KPIs
  setText("patrimoineNet",  data.patrimoine_net);
  setText("patrimoineBrut", data.patrimoine_brut);
  setText("dettes",         data.dettes);
  setText("cashKpi",        data.cash_disponible);

  setText("variationMensuelle", diffFmt);
  document.getElementById("variationMensuelle")?.classList.toggle("negative", !pos);
  document.getElementById("variationMensuelle")?.classList.toggle("positive",  pos);
  setText("varMensuelleKpi",    diffFmt);
  setText("varMensuellePctKpi", pctFmt);
  setText("perfYtd", ytdText);

  // Allocation donut + légende
  setText("allocImmoText", allocImmo + " %");
  setText("allocPeaText",  allocPea  + " %");
  setText("allocCashText", allocCash + " %");
  setText("allocImmoVal",  data.immo_bien1_valeur || "--");
  setText("allocPeaVal",   data.pea_valeur        || "--");
  setText("allocCashVal",  data.cash_disponible   || "--");
  initAllocChart(allocImmo, allocPea, allocCash);

  // Tableau détail (% net maintenant calculés)
  setText("dtImmoVal",     data.immo_bien1_valeur || "--");
  setText("dtImmoPctBrut", allocImmo + " %");
  setText("dtImmoPctNet",  pctNetImmo);
  setText("dtImmoEvo",     data.immo_evo_mensuelle || "—");

  setText("dtPeaVal",      data.pea_valeur || "--");
  setText("dtPeaPctBrut",  allocPea  + " %");
  setText("dtPeaPctNet",   pctNetPea);
  setText("dtPeaEvo",      data.pea_evo_mensuelle || "—");

  setText("dtCashVal",     data.cash_disponible || "--");
  setText("dtCashPctBrut", allocCash + " %");
  setText("dtCashPctNet",  pctNetCash);
  setText("dtCashEvo",     data.cash_evo_mensuelle || "—");

  setText("dtTotalVal",    data.patrimoine_brut || "--");
  setText("dtTotalPctNet", pctNetTotal);
  setText("dtTotalEvo",    diffFmt);

  // Répartition barres
  document.getElementById("repImmoBar").style.width  = allocImmo + "%";
  document.getElementById("repPeaBar").style.width   = allocPea  + "%";
  document.getElementById("repCashBar").style.width  = allocCash + "%";
  setText("repImmoVal",     data.immo_bien1_valeur || "--");
  setText("repPeaVal",      data.pea_valeur        || "--");
  setText("repCashVal",     data.cash_disponible   || "--");
  setText("repTotalActifs", data.patrimoine_brut   || "--");
  setText("repDettes",      data.dettes            || "--");
  setText("repPatNet",      data.patrimoine_net    || "--");

  // Mini panel Immo
  setText("immoBien1Nom",    data.immo_bien1_nom    || "Résidence principale");
  setText("immoBien1Valeur", data.immo_bien1_valeur || "--");
  setText("immoBien1Dette",  data.immo_bien1_dette  || "--");
  setText("immoBien1Net",    v1 || d1 ? fmtEur.format(v1 - d1) : "--");

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
  setText("cash1Nom",   data.cash1_nom);   setText("cash1Valeur", data.cash1_valeur);
  setText("cash2Nom",   data.cash2_nom);   setText("cash2Valeur", data.cash2_valeur);
  setText("cash3Nom",   data.cash3_nom);   setText("cash3Valeur", data.cash3_valeur);
  setText("cash4Nom",   data.cash4_nom);   setText("cash4Valeur", data.cash4_valeur);
  const c1 = parseNum((data.cash1_valeur||"").replace(/[^\d.-]/g,""));
  const c2 = parseNum((data.cash2_valeur||"").replace(/[^\d.-]/g,""));
  const c3 = parseNum((data.cash3_valeur||"").replace(/[^\d.-]/g,""));
  const c4 = parseNum((data.cash4_valeur||"").replace(/[^\d.-]/g,""));
  const totalCash = c1 + c2 + c3 + c4;
  setText("cashTotal", totalCash ? fmtEur.format(totalCash) : (data.cash_disponible || "--"));

  // Pages dédiées
  setText("immoP_bien1Nom",    data.immo_bien1_nom    || "Résidence principale");
  setText("immoP_bien1Valeur", data.immo_bien1_valeur || "--");
  setText("immoP_bien1Dette",  data.immo_bien1_dette  || "--");
  setText("immoP_bien1Net",    v1 || d1 ? fmtEur.format(v1 - d1) : "--");
  setText("immoP_bien2Nom",    data.immo_bien2_nom    || "Bien 2");
  setText("immoP_bien2Valeur", data.immo_bien2_valeur || "--");
  setText("immoP_bien2Dette",  data.immo_bien2_dette  || "--");
  setText("immoP_bien2Net",    v2 || d2 ? fmtEur.format(v2 - d2) : "--");

  setText("peaP_valeur",       data.pea_valeur        || "--");
  setText("peaP_actif1Nom",    data.pea_actif1_nom    || "--");
  setText("peaP_actif1Valeur", data.pea_actif1_valeur || "--");
  setText("peaP_actif2Nom",    data.pea_actif2_nom    || "--");
  setText("peaP_actif2Valeur", data.pea_actif2_valeur || "--");
  setText("peaP_perf",         peaPerfText);

  setText("cashP_1Nom",  data.cash1_nom); setText("cashP_1Valeur", data.cash1_valeur);
  setText("cashP_2Nom",  data.cash2_nom); setText("cashP_2Valeur", data.cash2_valeur);
  setText("cashP_3Nom",  data.cash3_nom); setText("cashP_3Valeur", data.cash3_valeur);
  setText("cashP_4Nom",  data.cash4_nom); setText("cashP_4Valeur", data.cash4_valeur);

  // Sync badge
  const upd    = new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" });
  const uptime = new Date().toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
  setText("lastUpdate", upd + " – " + uptime);

  // Goals
  const currentNet = netNum || last;
  renderGoals(data, currentNet);

  hideSkeleton();
}

// ── Init ──────────────────────────────────────────────────────────────────────
initWealthChart();
loadSheetData();
