import { cars } from "./cars.js";

const detailsContainer = document.getElementById("carDetails");
const priceInput = document.getElementById("leasePrice");
const downPaymentInput = document.getElementById("leaseDownPayment");
const termInput = document.getElementById("leaseTerm");
const rateInput = document.getElementById("leaseRate");
const calcButton = document.getElementById("leaseCalcBtn");
const monthlyPayment = document.getElementById("monthlyPayment");
const leaseMeta = document.getElementById("leaseMeta");

const MDL_PER_EUR = 19.6;

const params = new URLSearchParams(window.location.search);
const carId = params.get("id");
const car = cars.find((item) => item.id === carId);

function formatMoney(value, currency) {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Math.round(value));
}

function formatDualPrice(mdlValue) {
  const eurValue = mdlValue / MDL_PER_EUR;
  return `${formatMoney(mdlValue, "MDL")} / ${formatMoney(eurValue, "EUR")}`;
}

function renderCarCard() {
  if (!car) {
    detailsContainer.innerHTML = `
      <h1 class="detail-title">Automobilul nu a fost gasit</h1>
      <p class="detail-description">Revino in catalog si alege o alta oferta.</p>
      <a href="index.html" class="hero-button">Inapoi la catalog</a>
    `;
    return;
  }

  document.title = `BossAuto - ${car.brand} ${car.model}`;

  detailsContainer.innerHTML = `
    <img class="detail-image" src="${car.image}" alt="${car.brand} ${car.model}" />
    <h1 class="detail-title">${car.brand} ${car.model}</h1>
    <p class="detail-price">${formatDualPrice(car.price)}</p>

    <div class="spec-grid">
      <div class="spec-item"><strong>An</strong><span>${car.year}</span></div>
      <div class="spec-item"><strong>Rulaj</strong><span>${car.mileage.toLocaleString("ro-RO")} km</span></div>
      <div class="spec-item"><strong>Motor</strong><span>${car.engine}</span></div>
      <div class="spec-item"><strong>Tractiune</strong><span>${car.drivetrain}</span></div>
      <div class="spec-item"><strong>Cutie</strong><span>${car.transmission}</span></div>
      <div class="spec-item"><strong>Combustibil</strong><span>${car.fuel}</span></div>
      <div class="spec-item"><strong>Caroserie</strong><span>${car.body}</span></div>
      <div class="spec-item"><strong>Culoare</strong><span>${car.color}</span></div>
    </div>

    <p class="detail-description">${car.description}</p>
  `;

  const detailImage = detailsContainer.querySelector(".detail-image");
  detailImage?.addEventListener("error", () => {
    detailImage.src = "placeholder-car.svg";
  });

  priceInput.value = String(car.price);
  downPaymentInput.value = String(Math.round(car.price * 0.2));
}

function calculateLeasing() {
  const price = Number(priceInput.value);
  const downPayment = Number(downPaymentInput.value);
  const term = Number(termInput.value);
  const annualRate = Number(rateInput.value);

  if (!price || term <= 0 || annualRate < 0 || downPayment < 0) {
    monthlyPayment.textContent = "Verifica parametrii";
    leaseMeta.textContent = "Introdu valori numerice corecte";
    return;
  }

  const financedAmount = Math.max(price - downPayment, 0);
  const monthlyRate = annualRate / 12 / 100;

  let payment = 0;

  if (monthlyRate === 0) {
    payment = financedAmount / term;
  } else {
    payment =
      (financedAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));
  }

  const paymentEur = payment / MDL_PER_EUR;
  monthlyPayment.textContent = `${formatMoney(payment, "MDL")} / ${formatMoney(paymentEur, "EUR")}`;
  leaseMeta.textContent = `Suma finantata: ${formatMoney(financedAmount, "MDL")} · ${term} luni · ${annualRate}% pe an`;
}

calcButton.addEventListener("click", calculateLeasing);

renderCarCard();
calculateLeasing();
