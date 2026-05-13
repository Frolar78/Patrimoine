const wealthCanvas = document.getElementById("wealthChart");

const wealthGradient = wealthCanvas
  .getContext("2d")
  .createLinearGradient(0, 0, 0, 300);

wealthGradient.addColorStop(0, "rgba(37,99,235,.22)");
wealthGradient.addColorStop(1, "rgba(37,99,235,0)");

new Chart(wealthCanvas, {

  type: "line",

  data: {
    labels: [
      "Juin","Juil","Août","Sept","Oct","Nov",
      "Déc","Jan","Fév","Mars","Avr","Mai"
    ],

    datasets: [{

      label: "Patrimoine net",

      data: [
        44000,45500,47100,48900,
        50300,52100,53800,55200,
        57300,59000,59741,62172
      ],

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

    plugins: {
      legend: {
        display: false
      }
    },

    scales: {

      x: {
        grid: {
          display: false
        },

        ticks: {
          color: "#94a3b8"
        }
      },

      y: {

        grid: {
          color: "#f1f5f9"
        },

        ticks: {
          color: "#94a3b8"
        }
      }
    }
  }
});

let allocationChart;

function createAllocationChart(immo, pea, cash) {

  const allocationCtx = document.getElementById("allocationChart");

  allocationChart = new Chart(allocationCtx, {
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
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });

}
    const pageConfig = {
  overview: {
    title: "Patrimoine",
    subtitle: "Vue consolidée de ton patrimoine net, de tes actifs et de ta progression."
  },
  immo: {
    title: "Immobilier",
    subtitle: "Suivi de tes biens, dettes et valeur nette."
  },
  pea: {
    title: "PEA",
    subtitle: "ETF, valorisation et performance."
  },
  cash: {
    title: "Cash",
    subtitle: "Liquidités et épargne disponible."
  },
  goals: {
    title: "Objectifs",
    subtitle: "Progression patrimoniale long terme."
  }
};

const navLinks = document.querySelectorAll(".nav-link");
const mobileBtns = document.querySelectorAll(".mobile-btn");
const pages = document.querySelectorAll(".page");

function switchPage(page) {
  pages.forEach(p => p.classList.remove("active-page"));
  document.getElementById(page + "Page").classList.add("active-page");

  navLinks.forEach(l => l.classList.remove("active"));
  mobileBtns.forEach(b => b.classList.remove("active"));

  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => {
    el.classList.add("active");
  });

  document.getElementById("pageTitle").textContent = pageConfig[page].title;
  document.getElementById("pageSubtitle").textContent = pageConfig[page].subtitle;
}

[...navLinks, ...mobileBtns].forEach(el => {
  el.addEventListener("click", e => {
    e.preventDefault();
    switchPage(el.dataset.page);
  });
});
    async function loadSheetData() {

  const response = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vQ7tkMrE-yzrCTzOYeDkOdTNU8vHSsCGtVaLUDrv8ZyTtSa44d8cSeLNaTjw6CPdg/pub?gid=512150963&single=true&output=csv");

  const csv = await response.text();

  const rows = csv.trim().split("\n").map(r => r.split(","));

  const data = {};

  rows.slice(1).forEach(row => {
    data[row[0]] = row[1];
  });

  console.log(data);
      
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "--";
}

setText("patrimoineNet", data.patrimoine_net);
setText("patrimoineBrut", data.patrimoine_brut);
setText("dettes", data.dettes);
setText("cash", data.cash_disponible);

setText("immoBien1Nom", data.immo_bien1_nom);
setText("immoBien1Valeur", data.immo_bien1_valeur);
setText("immoBien1Dette", data.immo_bien1_dette);
setText("immoBien1Net", data.immo_bien1_net);

setText("immoBien2Nom", data.immo_bien2_nom);
setText("immoBien2Valeur", data.immo_bien2_valeur);
setText("immoBien2Dette", data.immo_bien2_dette);
setText("immoBien2Net", data.immo_bien2_net);

setText("peaValeur", data.pea_valeur);
setText(
  "peaPerf",
  data.pea_performance?.replaceAll('"', '') + "%"
);

setText("peaActif1Nom", data.pea_actif1_nom);
setText("peaActif1Valeur", data.pea_actif1_valeur);
setText("peaActif2Nom", data.pea_actif2_nom);
setText("peaActif2Valeur", data.pea_actif2_valeur);

setText("cash1Nom", data.cash1_nom);
setText("cash1Valeur", data.cash1_valeur);
setText("cash2Nom", data.cash2_nom);
setText("cash2Valeur", data.cash2_valeur);
setText("cash3Nom", data.cash3_nom);
setText("cash3Valeur", data.cash3_valeur);
setText("cash4Nom", data.cash4_nom);
setText("cash4Valeur", data.cash4_valeur);
        
const today = new Date().toLocaleDateString("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

setText("lastUpdate", "Dernière mise à jour : " + today);
        
function parsePercent(value) {
  if (!value) return 0;

  return Number(
    value
      .toString()
      .replaceAll('"', '')
      .replace('%', '')
      .replace(',', '.')
      .trim()
  );
}

const allocImmo = parsePercent(data.allocation_immobilier);
const allocPea = parsePercent(data.allocation_pea);
const allocCash = parsePercent(data.allocation_cash);

console.log("Allocations :", allocImmo, allocPea, allocCash);

if (allocationChart) {
  allocationChart.destroy();
}

createAllocationChart(
  allocImmo,
  allocPea,
  allocCash
);     
        
}

loadSheetData();
