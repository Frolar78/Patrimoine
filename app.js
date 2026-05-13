// ── Wealth Chart ─────────────────────────────────────────────────────────────

const wealthData = [
  44000, 45500, 47100, 48900,
  50300, 52100, 53800, 55200,
  57300, 59000, 59741, 62172
];

const wealthCanvas = document.getElementById("wealthChart");
const wealthGradient = wealthCanvas.getContext("2d").createLinearGradient(0, 0, 0, 300);
wealthGradient.addColorStop(0, "rgba(37,99,235,.22)");
wealthGradient.addColorStop(1, "rgba(37,99,235,0)");

new Chart(wealthCanvas, {
  type: "line",
  data: {
    labels: [
      "Juin", "Juil", "Août", "Sept", "Oct", "Nov",
      "Déc", "Jan", "Fév", "Mars", "Avr", "Mai"
    ],
    datasets: [{
      label: "Patrimoine net",
      data: wealthData,
      borderColor: "#2563eb",
      backgroundColor: wealthGradient,
      fill: true,
      tension: .42,
      pointRadius: 0,
      borderWidth: 4
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#94a3b8" } },
      y: { grid: { color: "#f1f5f9" }, ticks: { color: "#94a3b8" } }
    }
  }
});

// ── Allocation Donut ──────────────────────────────────────────────────────────

let allocationChart;

function createAllocationChart(immo, pea, cash) {
  const ctx = document.getElementById("allocationChart");
  if (allocationChart) allocationChart.destroy();
  allocationChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Immobilier", "PEA", "Cash"],
      datasets: [{
        data: [immo, pea, cash],
        backgroundColor: ["#2563eb", "#16a34a", "#f59e0b"],
        borderWidth: 0,
        cutout: "72%"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────

const pageConfig = {
  overview: { title: "Patrimoine",   subtitle: "Vue consolidée de ton patrimoine net, de tes actifs et de ta progression." },
  immo:     { title: "Immobilier",   subtitle: "Suivi de tes biens, dettes et valeur nette." },
  pea:      { title: "PEA",          subtitle: "ETF, valorisation et performance." },
  cash:     { title: "Cash",         subtitle: "Liquidités et épargne disponible." },
  goals:    { title: "Objectifs",    subtitle: "Progression patrimoniale long terme." }
};

const navLinks   = document.querySelectorAll(".nav-link");
const mobileBtns = document.querySelectorAll(".mobile-btn");
const pages      = document.querySelectorAll(".page");

function switchPage(page) {
  pages.forEach(p => p.classList.remove("active-page"));
  document.getElementById(page + "Page").classList.add("active-page");
  navLinks.forEach(l => l.classList.remove("active"));
  mobileBtns.forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add("active"));
  document.getElementById("pageTitle").textContent    = pageConfig[page].title;
  document.getElementById("pageSubtitle").textContent = pageConfig[page].subtitle;
}

[...navLinks, ...mobileBtns].forEach(el => {
  el.addEventListener("click", e => { e.preventDefault(); switchPage(el.dataset.page); });
});

// ── CSV helpers ───────────────────────────────────────────────────────────────

/**
 * BUG #3 FIX — proper RFC-4180 CSV parser.
 * Handles quoted fields that contain commas, newlines or escaped quotes.
 */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"')            { inQuotes = false; }
      else                            { field += ch; }
    } else {
      if      (ch === '"')            { inQuotes = true; }
      else if (ch === ',')            { row.push(field); field = ""; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(field); field = "";
        rows.push(row);  row = [];
      } else { field += ch; }
    }
  }

  // last field / row
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * BUG #4 FIX — strip quotes AND trailing %-sign before re-adding.
 * Returns a Number so callers can decide formatting.
 */
function parsePercent(value) {
  if (!value) return 0;
  return Number(
    value.toString()
      .replace(/"/g, "")
      .replace(/%/g, "")   // remove any existing % sign
      .replace(",", ".")
      .trim()
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "--";
}

// ── Sheet data ────────────────────────────────────────────────────────────────

async function loadSheetData() {
  const url =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ7tkMrE-yzrCTzOYeDkOdTNU8vHSsCGtVaLUDrv8ZyTtSa44d8cSeLNaTjw6CPdg/pub?gid=512150963&single=true&output=csv";

  const response = await fetch(url);
  const csv      = await response.text();

  // BUG #3 FIX — use proper parser
  const rows = parseCSV(csv.trim());
  const data = {};
  rows.slice(1).forEach(row => { if (row[0]) data[row[0]] = row[1] ?? ""; });

  console.log("Sheet data:", data);

  // ── Overview KPIs ────────────────────────────────────────────────────────
  setText("patrimoineNet",  data.patrimoine_net);
  setText("patrimoineBrut", data.patrimoine_brut);
  setText("dettes",         data.dettes);
  setText("cash",           data.cash_disponible);
  setText("cashOverview",   data.cash_disponible);

  // BUG #2 FIX — compute immo_net = bien1_net + bien2_net if no dedicated key
  const immoNet = data.immo_net
    || (() => {
      const v1 = parseFloat((data.immo_bien1_net || "0").replace(/[^\d.-]/g, ""));
      const v2 = parseFloat((data.immo_bien2_net || "0").replace(/[^\d.-]/g, ""));
      if (!isNaN(v1) && !isNaN(v2)) {
        return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v1 + v2);
      }
      return data.immo_bien1_net;
    })();
  setText("immoNet", immoNet);

  // ── Detail table ─────────────────────────────────────────────────────────
  setText("overviewImmo1",      data.immo_bien1_net);
  setText("overviewImmo2",      data.immo_bien2_net);
  setText("overviewPea",        data.pea_valeur);
  setText("overviewCash",       data.cash_disponible);
  setText("overviewDette1",     data.immo_bien1_dette);
  setText("overviewDette2",     data.immo_bien2_dette);
  setText("overviewDettesTotal",data.dettes);

  // ── Immobilier page ───────────────────────────────────────────────────────
  setText("immoBien1Nom",   data.immo_bien1_nom);
  setText("immoBien1Valeur",data.immo_bien1_valeur);
  setText("immoBien1Dette", data.immo_bien1_dette);
  setText("immoBien1Net",   data.immo_bien1_net);
  setText("immoBien2Nom",   data.immo_bien2_nom);
  setText("immoBien2Valeur",data.immo_bien2_valeur);
  setText("immoBien2Dette", data.immo_bien2_dette);
  setText("immoBien2Net",   data.immo_bien2_net);

  // ── PEA page ──────────────────────────────────────────────────────────────
  setText("peaValeurOverview", data.pea_valeur);
  setText("peaValeurPage",     data.pea_valeur);

  // BUG #4 FIX — strip any existing % before adding one
  const peaPerf = parsePercent(data.pea_performance);
  const peaPerfText = isNaN(peaPerf) ? "--" : peaPerf.toFixed(1) + " %";
  setText("peaPerfOverview", peaPerfText);
  setText("peaPerfPage",     peaPerfText);

  setText("peaActif1Nom",   data.pea_actif1_nom);
  setText("peaActif1Valeur",data.pea_actif1_valeur);
  setText("peaActif2Nom",   data.pea_actif2_nom);
  setText("peaActif2Valeur",data.pea_actif2_valeur);

  // ── Cash page ─────────────────────────────────────────────────────────────
  setText("cash1Nom",   data.cash1_nom);
  setText("cash1Valeur",data.cash1_valeur);
  setText("cash2Nom",   data.cash2_nom);
  setText("cash2Valeur",data.cash2_valeur);
  setText("cash3Nom",   data.cash3_nom);
  setText("cash3Valeur",data.cash3_valeur);
  setText("cash4Nom",   data.cash4_nom);
  setText("cash4Valeur",data.cash4_valeur);

  // ── Last update ───────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  });
  setText("lastUpdate", "Dernière mise à jour : " + today);

  // ── Allocation ────────────────────────────────────────────────────────────
  const allocImmo = parsePercent(data.allocation_immobilier);
  const allocPea  = parsePercent(data.allocation_pea);
  const allocCash = parsePercent(data.allocation_cash);

  setText("allocImmoText", allocImmo + " %");
  setText("allocPeaText",  allocPea  + " %");
  setText("allocCashText", allocCash + " %");

  document.getElementById("allocImmoBar").style.width = allocImmo + "%";
  document.getElementById("allocPeaBar").style.width  = allocPea  + "%";
  document.getElementById("allocCashBar").style.width = allocCash + "%";

  createAllocationChart(allocImmo, allocPea, allocCash);

  // ── BUG #1 FIX — variation mensuelle ─────────────────────────────────────
  // Utilise les 2 dernières valeurs du tableau wealthData (mois N-1 → mois N)
  // ou la clé variation_mensuelle du sheet si elle existe
  const elDelta = document.getElementById("variationMensuelle");
  if (elDelta) {
    let deltaText = "--";
    let positive  = true;

    if (data.variation_mensuelle) {
      // Clé dédiée dans le sheet (format: "2431" ou "+2431 €")
      deltaText = data.variation_mensuelle;
      positive  = !deltaText.trim().startsWith("-");
    } else {
      // Fallback : calcul sur les 2 derniers mois du graphique
      const last    = wealthData[wealthData.length - 1];
      const prev    = wealthData[wealthData.length - 2];
      const diff    = last - prev;
      positive      = diff >= 0;
      const fmt     = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
      deltaText     = (positive ? "+" : "") + fmt.format(diff) + " ce mois";
    }

    elDelta.textContent = deltaText;
    elDelta.className   = "hero-delta " + (positive ? "positive" : "negative");
  }

  // ── BUG #6 FIX — objectifs dynamiques ────────────────────────────────────
  // Clés attendues dans le sheet : goal1_label, goal1_target, goal1_current
  //                                goal2_label, goal2_target, goal2_current
  const goalsContainer = document.querySelector("#goalsPage .panel");
  if (goalsContainer && (data.goal1_target || data.goal2_target)) {
    // Vider les objectifs hardcodés
    goalsContainer.querySelectorAll(".goal").forEach(g => g.remove());

    [1, 2].forEach(i => {
      const label   = data[`goal${i}_label`]   || `Objectif ${i}`;
      const target  = parseFloat((data[`goal${i}_target`]  || "0").replace(/[^\d.-]/g, "")) || 0;
      const current = parseFloat((data[`goal${i}_current`] || "0").replace(/[^\d.-]/g, "")) || 0;
      if (!target) return;

      const pct = Math.min(100, Math.round(current / target * 100));
      const fmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

      const div = document.createElement("div");
      div.className = "goal";
      div.innerHTML = `
        <div class="goal-top">
          <strong>${label} — ${fmt.format(target)}</strong>
          <span>${pct} %</span>
        </div>
        <div class="bar"><span style="width:${pct}%"></span></div>
      `;
      goalsContainer.appendChild(div);
    });
  }
}

loadSheetData();
