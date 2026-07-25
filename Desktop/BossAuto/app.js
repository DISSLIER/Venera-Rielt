import { cars } from "./cars.js";

const menuToggle = document.getElementById("menuToggle");
const menuClose = document.getElementById("menuClose");
const mobileMenu = document.getElementById("mobileMenu");
const menuBackdrop = document.getElementById("menuBackdrop");
const catalogGrid = document.getElementById("catalogGrid");
const viewButtons = document.querySelectorAll(".view-btn");

const MDL_PER_EUR = 19.6;

function formatMoney(value, currency) {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function formatDualPrice(mdlValue) {
  const eurValue = mdlValue / MDL_PER_EUR;
  return `${formatMoney(mdlValue, "MDL")} / ${formatMoney(eurValue, "EUR")}`;
}

function renderCards() {
  const html = cars
    .map(
      (car) => `
      <a class="car-card" href="car.html?id=${car.id}" aria-label="${car.brand} ${car.model}">
        <img class="car-image" src="${car.image}" alt="${car.brand} ${car.model}" loading="lazy" />
        <div class="car-content">
          <div class="car-title-row">
            <h3 class="car-title">${car.brand} ${car.model}</h3>
            <span class="car-year">${car.year}</span>
          </div>
          <p class="car-meta">${car.mileage.toLocaleString("ro-RO")} km · ${car.engine}</p>
          <strong class="car-price">${formatDualPrice(car.price)}</strong>
          <span class="more-link">Vezi detalii →</span>
        </div>
      </a>
    `
    )
    .join("");

  catalogGrid.innerHTML = html;

  catalogGrid.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", () => {
      img.src = "placeholder-car.svg";
    });
  });
}

function setView(mode) {
  catalogGrid.classList.remove("view-two", "view-one", "view-row");

  if (mode === "one") {
    catalogGrid.classList.add("view-one");
  } else if (mode === "row") {
    catalogGrid.classList.add("view-row");
  } else {
    catalogGrid.classList.add("view-two");
  }

  viewButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === mode);
  });
}

function closeMenu() {
  mobileMenu.classList.remove("is-open");
  menuBackdrop.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
});

menuToggle?.addEventListener("click", () => {
  const isOpen = mobileMenu.classList.toggle("is-open");
  menuBackdrop.classList.toggle("is-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

menuClose?.addEventListener("click", closeMenu);
menuBackdrop?.addEventListener("click", closeMenu);

mobileMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    closeMenu();
  });
});

renderCards();
setView("two");
