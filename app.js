    const wealthCtx = document.getElementById('wealthChart');
    new Chart(wealthCtx, {
      type: 'line',
      data: {
        labels: ['Juin','Juil','Août','Sept','Oct','Nov','Déc','Jan','Fév','Mars','Avr','Mai'],
        datasets: [{
          label: 'Patrimoine net',
          data: [44000,45500,47100,48900,50300,52100,53800,55200,57300,59000,59741,62172],
          borderColor: '#111827',
          backgroundColor: 'rgba(17,24,39,.08)',
          tension: .42,
          fill: true,
          pointRadius: 0,
          borderWidth: 3
        }]
      },
      options: {
        responsive:true,
        maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{
          x:{ grid:{ display:false }, ticks:{ color:'#6b7280' } },
          y:{ grid:{ color:'#f3f4f6' }, ticks:{ color:'#6b7280' } }
        }
      }
    });

    const allocationCtx = document.getElementById('allocationChart');
    new Chart(allocationCtx, {
      type: 'doughnut',
      data: {
        labels: ['Immobilier','PEA','Cash'],
        datasets: [{
          data: [74,10,16],
          backgroundColor: ['#111827','#16a34a','#d1d5db'],
          borderWidth: 0,
          cutout: '72%'
        }]
      },
      options: {
        responsive:true,
        maintainAspectRatio:false,
        plugins:{ legend:{ display:false } }
      }
    });
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
      
document.getElementById("patrimoineNet").textContent = data.patrimoine_net;
document.getElementById("patrimoineBrut").textContent = data.patrimoine_brut;
document.getElementById("dettes").textContent = data.dettes;
document.getElementById("cash").textContent = data.cash_disponible;
document.getElementById("immoNet").textContent = data.immobilier_net;
document.getElementById("immoDette").textContent = data.dettes;
document.getElementById("peaValeur").textContent = data.pea_valeur;
document.getElementById("peaPerf").textContent = data.pea_performance.replaceAll('"', '');
document.getElementById("cashDetail").textContent = data.cash_disponible;
      
}

loadSheetData();
