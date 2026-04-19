const state = {
  payload: null,
  search: "",
  category: "Vše",
  activeView: "foods",
  selectedFoodId: null,
  selectedNutrientId: null,
};

const elements = {
  searchInput: document.querySelector("#search-input"),
  filters: document.querySelector("#filters"),
  foodGrid: document.querySelector("#food-grid"),
  nutrientGrid: document.querySelector("#nutrient-grid"),
  foodDetail: document.querySelector("#food-detail"),
  nutrientDetail: document.querySelector("#nutrient-detail"),
  foodsCount: document.querySelector("#foods-count"),
  nutrientsCount: document.querySelector("#nutrients-count"),
  statsGrid: document.querySelector("#stats-grid"),
  syncPill: document.querySelector("#sync-pill"),
  setupNote: document.querySelector("#setup-note"),
  setupMessage: document.querySelector("#setup-message"),
  foodsBoard: document.querySelector("#foods-board"),
  nutrientsBoard: document.querySelector("#nutrients-board"),
  segmentButtons: [...document.querySelectorAll(".segment-button")],
  scrollToFoods: document.querySelector("#scroll-to-foods"),
  scrollToNutrients: document.querySelector("#scroll-to-nutrients"),
};

bootstrap();

async function bootstrap() {
  bindEvents();

  try {
    const response = await fetch("/api/content");
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.hint || payload.error || "Nepodařilo se načíst data.");
    }

    state.payload = payload;
    state.selectedFoodId = payload.foods[0]?.id || null;
    state.selectedNutrientId = payload.nutrients[0]?.id || null;

    renderStats();
    renderFilters();
    renderFoods();
    renderNutrients();
    renderFoodDetail();
    renderNutrientDetail();
    updateSyncPill();
  } catch (error) {
    elements.setupNote.hidden = false;
    elements.setupMessage.textContent = error.message;
    elements.syncPill.textContent = "Notion připojení není nakonfigurované";
  }
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderFoods();
    renderNutrients();
  });

  elements.segmentButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      elements.segmentButtons.forEach((item) =>
        item.classList.toggle("is-active", item === button)
      );
      elements.foodsBoard.classList.toggle("is-hidden", state.activeView !== "foods");
      elements.nutrientsBoard.classList.toggle("is-hidden", state.activeView !== "nutrients");
    });
  });

  elements.scrollToFoods.addEventListener("click", () => {
    state.activeView = "foods";
    syncActiveView();
    elements.foodsBoard.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  elements.scrollToNutrients.addEventListener("click", () => {
    state.activeView = "nutrients";
    syncActiveView();
    elements.nutrientsBoard.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function syncActiveView() {
  elements.segmentButtons.forEach((button) =>
    button.classList.toggle("is-active", button.dataset.view === state.activeView)
  );
  elements.foodsBoard.classList.toggle("is-hidden", state.activeView !== "foods");
  elements.nutrientsBoard.classList.toggle("is-hidden", state.activeView !== "nutrients");
}

function renderStats() {
  const foods = state.payload.foods;
  const nutrients = state.payload.nutrients;
  const dailyPillars = foods.filter((food) =>
    /denn|5-7x|3-7x/i.test(food.frequency || "")
  ).length;

  elements.statsGrid.innerHTML = `
    <article class="stat-card">
      <span class="stat-label">Potraviny</span>
      <strong class="stat-value">${foods.length}</strong>
    </article>
    <article class="stat-card">
      <span class="stat-label">Látky</span>
      <strong class="stat-value">${nutrients.length}</strong>
    </article>
    <article class="stat-card">
      <span class="stat-label">Denní pilíře</span>
      <strong class="stat-value">${dailyPillars}</strong>
    </article>
  `;
}

function renderFilters() {
  const categories = [
    "Vše",
    ...new Set(state.payload.foods.map((food) => food.category).filter(Boolean)),
  ];

  elements.filters.innerHTML = categories
    .map(
      (category) => `
        <button class="chip ${state.category === category ? "is-active" : ""}" data-category="${escapeHtml(category)}">
          ${escapeHtml(category)}
        </button>
      `
    )
    .join("");

  elements.filters.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      renderFilters();
      renderFoods();
    });
  });
}

function renderFoods() {
  const foods = getFilteredFoods();

  elements.foodsCount.textContent = `${foods.length} položek po filtrování`;

  if (!foods.length) {
    elements.foodGrid.innerHTML = `
      <article class="food-card">
        <h3>Nic jsem nenašel</h3>
        <p>Zkus jiný dotaz nebo si vrať kategorii na “Vše”.</p>
      </article>
    `;
    return;
  }

  if (!foods.some((food) => food.id === state.selectedFoodId)) {
    state.selectedFoodId = foods[0].id;
  }

  elements.foodGrid.innerHTML = foods
    .map((food) => {
      const isSelected = food.id === state.selectedFoodId;
      const previewCompounds = food.nutrientNames.slice(0, 3).join(" • ");

      return `
        <article class="food-card ${isSelected ? "is-selected" : ""}" data-food-id="${food.id}">
          <div class="food-card__top">
            <div>
              <span class="kicker">${escapeHtml(food.category)}</span>
              <h3>${escapeHtml(food.name)}</h3>
            </div>
            <span class="detail-badge">${escapeHtml(food.frequency || "Bez frekvence")}</span>
          </div>
          <p>${escapeHtml(food.benefit || "Bez popisu.")}</p>
          <p class="list-text">${escapeHtml(previewCompounds || "Bez přiřazených látek")}</p>
        </article>
      `;
    })
    .join("");

  elements.foodGrid.querySelectorAll("[data-food-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedFoodId = card.dataset.foodId;
      renderFoods();
      renderFoodDetail();
    });
  });
}

function renderFoodDetail() {
  const food = state.payload?.foods.find((item) => item.id === state.selectedFoodId);
  if (!food) {
    return;
  }

  const nutrientChips = food.nutrients.length
    ? food.nutrients
        .map(
          (nutrient) => `
            <button class="detail-chip" data-linked-nutrient="${nutrient.id}">
              ${escapeHtml(nutrient.name)}
            </button>
          `
        )
        .join("")
    : '<span class="list-pill">Bez propojených látek</span>';

  elements.foodDetail.innerHTML = `
    <div class="detail-grid">
      <div class="detail-panel">
        <div class="detail-header">
          <div>
            <p class="kicker">${escapeHtml(food.category)}</p>
            <h3>${escapeHtml(food.name)}</h3>
          </div>
          <span class="detail-badge">${escapeHtml(food.frequency || "Bez frekvence")}</span>
        </div>
        <div class="detail-rail">
          ${food.note ? `<span class="detail-chip">${escapeHtml(food.note)}</span>` : ""}
        </div>
      </div>

      <section class="detail-copy">
        <h4>Proč je zajímavá</h4>
        <p>${escapeHtml(food.benefit || "Bez doplněného benefitu.")}</p>
      </section>

      <section class="detail-copy">
        <h4>Hlavní látky</h4>
        <div class="detail-list">${nutrientChips}</div>
      </section>

      <section class="detail-copy">
        <h4>Praktická poznámka</h4>
        <p>${escapeHtml(food.note || "Bez poznámky.")}</p>
      </section>
    </div>
  `;

  elements.foodDetail.querySelectorAll("[data-linked-nutrient]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedNutrientId = button.dataset.linkedNutrient;
      state.activeView = "nutrients";
      syncActiveView();
      renderNutrients();
      renderNutrientDetail();
      elements.nutrientsBoard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderNutrients() {
  const nutrients = getFilteredNutrients();

  elements.nutrientsCount.textContent = `${nutrients.length} látek po filtrování`;

  if (!nutrients.length) {
    elements.nutrientGrid.innerHTML = `
      <article class="nutrient-card">
        <h3>Nic jsem nenašel</h3>
        <p>Zkus hledat jiný termín, třeba “omega”, “vláknina” nebo “vitamin”.</p>
      </article>
    `;
    return;
  }

  if (!nutrients.some((nutrient) => nutrient.id === state.selectedNutrientId)) {
    state.selectedNutrientId = nutrients[0].id;
  }

  elements.nutrientGrid.innerHTML = nutrients
    .map(
      (nutrient) => `
        <article class="nutrient-card ${nutrient.id === state.selectedNutrientId ? "is-selected" : ""}" data-nutrient-id="${nutrient.id}">
          <div class="nutrient-card__top">
            <div>
              <span class="kicker">${escapeHtml(nutrient.type)}</span>
              <h3>${escapeHtml(nutrient.name)}</h3>
            </div>
            <span class="detail-badge">${nutrient.foods.length} potravin</span>
          </div>
          <p>${escapeHtml(nutrient.benefit || "Bez popisu.")}</p>
        </article>
      `
    )
    .join("");

  elements.nutrientGrid.querySelectorAll("[data-nutrient-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedNutrientId = card.dataset.nutrientId;
      renderNutrients();
      renderNutrientDetail();
    });
  });
}

function renderNutrientDetail() {
  const nutrient = state.payload?.nutrients.find((item) => item.id === state.selectedNutrientId);
  if (!nutrient) {
    return;
  }

  const linkedFoods = nutrient.foods.length
    ? nutrient.foods
        .map(
          (food) => `
            <button class="detail-chip" data-linked-food="${food.id}">
              ${escapeHtml(food.name)}
            </button>
          `
        )
        .join("")
    : '<span class="list-pill">Zatím bez propojených potravin</span>';

  elements.nutrientDetail.innerHTML = `
    <div class="detail-grid">
      <div class="detail-panel">
        <div class="detail-header">
          <div>
            <p class="kicker">${escapeHtml(nutrient.type)}</p>
            <h3>${escapeHtml(nutrient.name)}</h3>
          </div>
          <span class="detail-badge">${nutrient.foods.length} zdrojů</span>
        </div>
      </div>

      <section class="detail-copy">
        <h4>Proč je prospěšná</h4>
        <p>${escapeHtml(nutrient.benefit || "Bez doplněného popisu.")}</p>
      </section>

      <section class="detail-copy">
        <h4>Kde ji najdeš</h4>
        <div class="detail-list">${linkedFoods}</div>
      </section>

      <section class="detail-copy">
        <h4>Poznámka</h4>
        <p>${escapeHtml(nutrient.note || "Bez poznámky.")}</p>
      </section>
    </div>
  `;

  elements.nutrientDetail.querySelectorAll("[data-linked-food]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFoodId = button.dataset.linkedFood;
      state.activeView = "foods";
      syncActiveView();
      renderFoods();
      renderFoodDetail();
      elements.foodsBoard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function getFilteredFoods() {
  if (!state.payload) {
    return [];
  }

  const search = state.search;

  return state.payload.foods.filter((food) => {
    const inCategory = state.category === "Vše" || food.category === state.category;
    if (!inCategory) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      food.name,
      food.category,
      food.frequency,
      food.benefit,
      food.note,
      ...(food.nutrientNames || []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

function getFilteredNutrients() {
  if (!state.payload) {
    return [];
  }

  const search = state.search;

  return state.payload.nutrients.filter((nutrient) => {
    if (!search) {
      return true;
    }

    return [
      nutrient.name,
      nutrient.type,
      nutrient.benefit,
      nutrient.note,
      nutrient.foodSources,
      ...nutrient.foods.map((food) => food.name),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

function updateSyncPill() {
  const stamp = new Date(state.payload.syncedAt);
  const formatted = new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(stamp);

  elements.syncPill.textContent = `Napojeno na Notion • synchronizace ${formatted}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
