const PAGE_SIZE = 12;
const categoryListEl = document.querySelector('[data-category-list]');
const brandListEl = document.querySelector('[data-brand-list]');
const ratingListEl = document.querySelector('[data-rating-list]');
const resultCountEl = document.querySelector('[data-result-count]');
const productsGridEl = document.querySelector('[data-products-grid]');
const paginationEl = document.querySelector('[data-pagination]');
const appliedFiltersEl = document.querySelector('[data-applied-filters]');
const sortSelectEl = document.querySelector('[data-sort-select]');
const priceMinSlider = document.querySelector('[data-price-min]');
const priceMaxSlider = document.querySelector('[data-price-max]');
const priceMinInput = document.querySelector('[data-price-min-input]');
const priceMaxInput = document.querySelector('[data-price-max-input]');
const resetButtons = Array.from(document.querySelectorAll('[data-reset]'));

const state = {
  categories: [],
  activeMain: null,
  expandedMain: null,
  productsCache: new Map(),
  metaCache: new Map(),
  allProducts: [],
  filteredProducts: [],
  totalProducts: 0,
  filters: {
    subs: new Set(),
    brands: new Set(),
    rating: null,
    price: { min: null, max: null },
  },
  priceBounds: { min: 0, max: 0 },
  sort: 'popularity',
  page: 1,
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
};

const integerFormatter = new Intl.NumberFormat('en-US');

const cssEscape = (value) => {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
};

const loadCategories = async () => {
  const response = await fetch('data/categories/map.json');
  if (!response.ok) throw new Error('Unable to load categories');
  const data = await response.json();
  state.categories = data;
  state.activeMain = data[0]?.cat_main_id ?? null;
  state.expandedMain = state.activeMain;
  renderMainCategories();
  if (state.activeMain) {
    await loadProductsForCategory(state.activeMain);
  }
};

const renderMainCategories = () => {
  if (!categoryListEl) return;
  categoryListEl.innerHTML = '';
  state.categories.forEach((category) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'catalog-category-main';
    const isActive = category.cat_main_id === state.activeMain;
    const isExpanded = category.cat_main_id === state.expandedMain;
    if (isActive) wrapper.classList.add('is-active');
    if (isExpanded) wrapper.classList.add('is-expanded');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-category-main__trigger';
    button.dataset.catMain = category.cat_main_id;
    const panelId = `catalog-panel-${category.cat_main_id}`;
    const triggerId = `catalog-trigger-${category.cat_main_id}`;
    button.id = triggerId;
    button.setAttribute('aria-controls', panelId);
    button.setAttribute('aria-expanded', String(isExpanded));
    button.innerHTML = `
      <span class="catalog-category-main__label">
        <span class="catalog-category-main__name">${category.category_main}</span>
      </span>
      <span class="catalog-category-main__meta">
        <span class="catalog-category-main__count">${category.products}</span>
        <span class="catalog-category-main__chevron" aria-hidden="true"></span>
      </span>
    `;
    button.addEventListener('click', async () => {
      if (state.activeMain === category.cat_main_id) {
        state.expandedMain = state.expandedMain === category.cat_main_id ? null : category.cat_main_id;
        renderMainCategories();
        return;
      }
      state.activeMain = category.cat_main_id;
      state.expandedMain = category.cat_main_id;
      state.filters.subs.clear();
      state.filters.brands.clear();
      state.filters.rating = null;
      state.filters.price = { min: null, max: null };
      state.page = 1;
      renderMainCategories();
      await loadProductsForCategory(category.cat_main_id);
    });
    wrapper.appendChild(button);

    const subList = document.createElement('div');
    subList.className = 'catalog-subcategory-list';
    subList.id = panelId;
    subList.setAttribute('role', 'region');
    subList.setAttribute('aria-labelledby', triggerId);
    subList.setAttribute('aria-hidden', String(!isExpanded));
    category.subs.forEach((sub) => {
      const label = document.createElement('label');
      label.className = 'catalog-checkbox';
      label.dataset.subId = sub.cat_sub_id;
      label.innerHTML = `
        <input type="checkbox" value="${sub.cat_sub_id}">
        <span class="catalog-checkbox__visual">
          <span class="catalog-checkbox__control"></span>
          <span class="catalog-checkbox__label">${sub.category_sub}</span>
        </span>
        <span class="catalog-checkbox__count">${sub.products}</span>
      `;
      const input = label.querySelector('input');
      input.checked = state.filters.subs.has(sub.cat_sub_id);
      input.addEventListener('change', () => {
        if (input.checked) {
          state.filters.subs.add(sub.cat_sub_id);
        } else {
          state.filters.subs.delete(sub.cat_sub_id);
        }
        state.page = 1;
        applyFilters();
      });
      subList.appendChild(label);
    });
    wrapper.appendChild(subList);
    categoryListEl.appendChild(wrapper);
  });
};

const loadProductsForCategory = async (catMainId) => {
  if (state.productsCache.has(catMainId)) {
    const cached = state.productsCache.get(catMainId);
    state.allProducts = cached.products;
    state.totalProducts = cached.meta.products ?? cached.products.length;
    decorateFiltersFromProducts();
    applyFilters();
    return;
  }

  const response = await fetch(`data/products/${catMainId}.json`);
  if (!response.ok) throw new Error('Unable to load products');
  const data = await response.json();

  state.productsCache.set(catMainId, data);
  state.metaCache.set(catMainId, data.meta);

  state.allProducts = data.products || [];
  state.totalProducts = data.meta?.products ?? state.allProducts.length;
  decorateFiltersFromProducts();
  applyFilters();
};

const decorateFiltersFromProducts = () => {
  if (!state.allProducts.length) {
    renderBrandList(new Map());
    state.priceBounds = { min: 0, max: 0 };
    syncPriceInputs();
    return;
  }
  const prices = state.allProducts.map((product) => product.price).filter((price) => typeof price === 'number');
  const minPrice = Math.floor(Math.min(...prices));
  const maxPrice = Math.ceil(Math.max(...prices));
  state.priceBounds = { min: minPrice, max: maxPrice };
  if (state.filters.price.min === null || state.filters.price.min < minPrice) {
    state.filters.price.min = minPrice;
  }
  if (state.filters.price.max === null || state.filters.price.max > maxPrice) {
    state.filters.price.max = maxPrice;
  }
  syncPriceInputs();

  const brandCount = new Map();
  state.allProducts.forEach((product) => {
    if (!product.brand) return;
    brandCount.set(product.brand, (brandCount.get(product.brand) || 0) + 1);
  });
  renderBrandList(brandCount);
  renderRatingOptions();
};

const syncPriceInputs = () => {
  const { min, max } = state.priceBounds;
  const currentMin = state.filters.price.min ?? min;
  const currentMax = state.filters.price.max ?? max;

  [priceMinSlider, priceMinInput].forEach((input) => {
    if (!input) return;
    input.min = String(min);
    input.max = String(max);
    input.value = String(currentMin);
  });
  [priceMaxSlider, priceMaxInput].forEach((input) => {
    if (!input) return;
    input.min = String(min);
    input.max = String(max);
    input.value = String(currentMax);
  });
};

const renderBrandList = (brandCount) => {
  if (!brandListEl) return;
  brandListEl.innerHTML = '';
  const sortedBrands = Array.from(brandCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (!sortedBrands.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No brand data available.';
    empty.style.fontSize = '0.85rem';
    empty.style.color = 'rgba(15, 29, 58, 0.6)';
    brandListEl.appendChild(empty);
    return;
  }

  sortedBrands.forEach(([brand, count]) => {
    const label = document.createElement('label');
    label.className = 'catalog-checkbox';
    label.dataset.brand = brand;
    label.innerHTML = `
      <input type="checkbox" value="${brand}">
      <span class="catalog-checkbox__visual">
        <span class="catalog-checkbox__control"></span>
        <span class="catalog-checkbox__label">${brand}</span>
      </span>
      <span class="catalog-checkbox__count">${count}</span>
    `;
    const input = label.querySelector('input');
    input.checked = state.filters.brands.has(brand);
    input.addEventListener('change', () => {
      if (input.checked) {
        state.filters.brands.add(brand);
      } else {
        state.filters.brands.delete(brand);
      }
      state.page = 1;
      applyFilters();
    });
    brandListEl.appendChild(label);
  });
};

const renderRatingOptions = () => {
  if (!ratingListEl) return;
  ratingListEl.innerHTML = '';
  const options = [4.5, 4, 3.5];
  options.forEach((rating) => {
    const label = document.createElement('label');
    label.className = 'catalog-checkbox';
    label.innerHTML = `
      <input type="radio" name="rating" value="${rating}">
      <span class="catalog-checkbox__visual">
        <span class="catalog-checkbox__control"></span>
        <span class="catalog-checkbox__label">${rating} ★ & up</span>
      </span>
    `;
    const input = label.querySelector('input');
    input.checked = state.filters.rating === rating;
    input.addEventListener('change', () => {
      state.filters.rating = input.checked ? rating : null;
      state.page = 1;
      applyFilters();
    });
    ratingListEl.appendChild(label);
  });

  const resetLabel = document.createElement('label');
  resetLabel.className = 'catalog-checkbox';
  resetLabel.innerHTML = `
    <input type="radio" name="rating" value="">
    <span class="catalog-checkbox__visual">
      <span class="catalog-checkbox__control"></span>
      <span class="catalog-checkbox__label">Any rating</span>
    </span>
  `;
  const resetInput = resetLabel.querySelector('input');
  resetInput.checked = state.filters.rating === null;
  resetInput.addEventListener('change', () => {
    state.filters.rating = null;
    state.page = 1;
    applyFilters();
  });
  ratingListEl.appendChild(resetLabel);
};

const applyFilters = () => {
  const { subs, brands, rating, price } = state.filters;
  const priceMin = price.min ?? state.priceBounds.min;
  const priceMax = price.max ?? state.priceBounds.max;

  let products = state.allProducts.filter((product) => {
    const matchesSub = !subs.size || subs.has(product.cat_sub_id);
    const matchesBrand = !brands.size || brands.has(product.brand);
    const matchesRating = rating === null || (product.rating ?? 0) >= rating;
    const matchesPrice = (product.price ?? 0) >= priceMin && (product.price ?? 0) <= priceMax;
    return matchesSub && matchesBrand && matchesRating && matchesPrice;
  });

  products = applySort(products);
  state.filteredProducts = products;
  state.page = Math.min(state.page, Math.max(1, Math.ceil(products.length / PAGE_SIZE) || 1));

  renderResultCount(products.length);
  renderAppliedFilters();
  renderProducts();
  renderPagination();
};

const applySort = (products) => {
  switch (state.sort) {
    case 'price-asc':
      return [...products].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    case 'price-desc':
      return [...products].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case 'rating-desc':
      return [...products].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case 'reviews-desc':
      return [...products].sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));
    case 'popularity':
    default:
      return [...products].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  }
};

const renderResultCount = (shown) => {
  if (!resultCountEl) return;
  const meta = state.metaCache.get(state.activeMain);
  const categoryName = meta?.category_main || 'All Products';
  const querySummary = (() => {
    if (!state.filters.subs.size) return categoryName;
    const subNames = meta?.subs
      ?.filter((sub) => state.filters.subs.has(sub.cat_sub_id))
      .map((sub) => sub.category_sub);
    return subNames?.length ? subNames.join(', ') : categoryName;
  })();

  resultCountEl.innerHTML = `<strong>${state.totalProducts}</strong> products · Showing <strong>${shown}</strong> for <strong>${querySummary}</strong>`;
};

const renderAppliedFilters = () => {
  if (!appliedFiltersEl) return;
  appliedFiltersEl.innerHTML = '';
  const meta = state.metaCache.get(state.activeMain);

  const createChip = (label, onRemove) => {
    const chip = document.createElement('span');
    chip.className = 'catalog-chip';
    chip.innerHTML = `${label} <button type="button" aria-label="Remove filter">&times;</button>`;
    chip.querySelector('button').addEventListener('click', onRemove);
    appliedFiltersEl.appendChild(chip);
  };

  state.filters.subs.forEach((subId) => {
    const sub = meta?.subs?.find((item) => item.cat_sub_id === subId);
    const name = sub?.category_sub || 'Category';
    createChip(name, () => {
      state.filters.subs.delete(subId);
      const checkbox = categoryListEl?.querySelector(`label[data-sub-id="${subId}"] input`);
      if (checkbox) checkbox.checked = false;
      state.page = 1;
      applyFilters();
    });
  });

  state.filters.brands.forEach((brand) => {
    createChip(brand, () => {
      state.filters.brands.delete(brand);
      const checkbox = brandListEl?.querySelector(`label[data-brand="${cssEscape(brand)}"] input`);
      if (checkbox) checkbox.checked = false;
      state.page = 1;
      applyFilters();
    });
  });

  if (state.filters.rating !== null) {
    createChip(`${state.filters.rating}★ & up`, () => {
      state.filters.rating = null;
      const active = ratingListEl?.querySelector('input[name="rating"]:checked');
      if (active) active.checked = false;
      state.page = 1;
      applyFilters();
    });
  }

  const priceMin = state.filters.price.min ?? state.priceBounds.min;
  const priceMax = state.filters.price.max ?? state.priceBounds.max;
  if (priceMin !== state.priceBounds.min || priceMax !== state.priceBounds.max) {
    createChip(`${formatCurrency(priceMin)} – ${formatCurrency(priceMax)}`, () => {
      state.filters.price = { min: state.priceBounds.min, max: state.priceBounds.max };
      syncPriceInputs();
      state.page = 1;
      applyFilters();
    });
  }

  if (!appliedFiltersEl.children.length) {
    const notice = document.createElement('span');
    notice.style.fontSize = '0.875rem';
    notice.style.color = 'rgba(15, 29, 58, 0.6)';
    notice.textContent = 'No filters applied.';
    appliedFiltersEl.appendChild(notice);
  }
};

const renderProducts = () => {
  if (!productsGridEl) return;
  const start = (state.page - 1) * PAGE_SIZE;
  const pageProducts = state.filteredProducts.slice(start, start + PAGE_SIZE);

  productsGridEl.classList.add('is-transitioning');
  requestAnimationFrame(() => {
    productsGridEl.innerHTML = '';
    if (!pageProducts.length) {
      const empty = document.createElement('div');
      empty.className = 'catalog-empty';
      empty.innerHTML = `
        <h3>No matching products</h3>
        <p>Adjust your filters to widen the results or choose a different category.</p>
      `;
      productsGridEl.appendChild(empty);
    } else {
      pageProducts.forEach((product) => {
        const card = document.createElement('article');
        card.className = 'catalog-product-card';
        const badgeLabel = (() => {
          if (typeof product.volume === 'number' && product.volume >= 1200) return 'Top Seller';
          if (typeof product.reviews === 'number' && product.reviews >= 1000) return 'Popular';
          if (typeof product.rating === 'number' && product.rating >= 4.7) return 'Best Rated';
          return '';
        })();
        const hasReviews = typeof product.reviews === 'number' && product.reviews > 0;
        const reviewsLabel = hasReviews
          ? `${integerFormatter.format(product.reviews)} review${product.reviews === 1 ? '' : 's'}`
          : 'No reviews yet';
        const ratingValue = typeof product.rating === 'number' ? product.rating.toFixed(1) : '–';
        const ratingAria = typeof product.rating === 'number' ? `Rated ${ratingValue} out of 5 stars` : 'No rating available';
        card.innerHTML = `
          <div class="catalog-product-card__media">
            <img src="${product.image}" alt="${product.title}" loading="lazy">
            ${badgeLabel ? `<span class="catalog-product-card__badge">${badgeLabel}</span>` : ''}
          </div>
          <div class="catalog-product-card__details">
            <div class="catalog-product-card__brand-row">
              <span class="catalog-product-card__brand">${product.brand ?? 'Unknown brand'}</span>
              <span class="catalog-product-card__reviews">${reviewsLabel}</span>
            </div>
            <h3 class="catalog-product-card__title">${product.title}</h3>
            <div class="catalog-product-card__footer">
              <span class="catalog-product-card__price">${formatCurrency(product.price ?? 0)}</span>
              <span class="catalog-product-card__rating" aria-label="${ratingAria}">
                <span class="catalog-product-card__star" aria-hidden="true">★</span>
                <span class="catalog-product-card__rating-value">${ratingValue}</span>
              </span>
            </div>
          </div>
        `;
        productsGridEl.appendChild(card);
      });
    }
    requestAnimationFrame(() => {
      productsGridEl.classList.remove('is-transitioning');
    });
  });
};

const renderPagination = () => {
  if (!paginationEl) return;
  paginationEl.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(state.filteredProducts.length / PAGE_SIZE));

  const makeButton = (label, page, disabled = false, isActive = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (disabled) button.disabled = true;
    if (isActive) button.classList.add('is-active');
    button.addEventListener('click', () => {
      state.page = page;
      renderProducts();
      renderPagination();
      window.scrollTo({ top: productsGridEl.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
    });
    paginationEl.appendChild(button);
  };

  makeButton('‹ Previous', Math.max(1, state.page - 1), state.page === 1);

  const windowSize = 5;
  const start = Math.max(1, state.page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);

  for (let page = start; page <= end; page += 1) {
    makeButton(String(page), page, false, page === state.page);
  }

  makeButton('Next ›', Math.min(totalPages, state.page + 1), state.page === totalPages);
};

const handleSortChange = () => {
  state.sort = sortSelectEl?.value || 'popularity';
  state.page = 1;
  applyFilters();
};

const handlePriceInputs = () => {
  const minValue = Math.max(state.priceBounds.min, Number(priceMinInput.value || state.priceBounds.min));
  const maxValue = Math.min(state.priceBounds.max, Number(priceMaxInput.value || state.priceBounds.max));
  if (minValue > maxValue) return;
  state.filters.price = { min: minValue, max: maxValue };
  priceMinSlider.value = String(minValue);
  priceMaxSlider.value = String(maxValue);
  state.page = 1;
  applyFilters();
};

const setupPriceHandlers = () => {
  if (priceMinSlider) {
    priceMinSlider.addEventListener('input', () => {
      const value = Number(priceMinSlider.value);
      if (value <= Number(priceMaxSlider.value)) {
        state.filters.price.min = value;
        priceMinInput.value = String(value);
        state.page = 1;
        applyFilters();
      }
    });
  }
  if (priceMaxSlider) {
    priceMaxSlider.addEventListener('input', () => {
      const value = Number(priceMaxSlider.value);
      if (value >= Number(priceMinSlider.value)) {
        state.filters.price.max = value;
        priceMaxInput.value = String(value);
        state.page = 1;
        applyFilters();
      }
    });
  }
  if (priceMinInput) {
    priceMinInput.addEventListener('change', handlePriceInputs);
  }
  if (priceMaxInput) {
    priceMaxInput.addEventListener('change', handlePriceInputs);
  }
};

const attachResetHandlers = () => {
  resetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.reset;
      switch (target) {
        case 'category':
          state.filters.subs.clear();
          categoryListEl?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
            input.checked = false;
          });
          break;
        case 'price':
          state.filters.price = { min: state.priceBounds.min, max: state.priceBounds.max };
          syncPriceInputs();
          break;
        case 'rating':
          state.filters.rating = null;
          ratingListEl?.querySelectorAll('input[type="radio"]').forEach((input) => {
            input.checked = input.value === '';
          });
          break;
        case 'brand':
          state.filters.brands.clear();
          brandListEl?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
            input.checked = false;
          });
          break;
        default:
          break;
      }
      state.page = 1;
      applyFilters();
    });
  });
};

const initCatalog = async () => {
  try {
    setupPriceHandlers();
    attachResetHandlers();
    sortSelectEl?.addEventListener('change', handleSortChange);
    await loadCategories();
  } catch (error) {
    if (resultCountEl) {
      resultCountEl.textContent = 'Failed to load catalog data. Please try again later.';
    }
    // eslint-disable-next-line no-console
    console.error(error);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCatalog);
} else {
  initCatalog();
}
