const PAGE_SIZE = 30;
const categoryListEl = document.querySelector('[data-category-list]');
const subcategoryListEl = document.querySelector('[data-subcategory-list]');
const brandFilterContainer = document.querySelector('[data-brand-filter]');
const brandListEl = brandFilterContainer?.querySelector('[data-brand-list]') ?? document.querySelector('[data-brand-list]');
const resultCountEl = document.querySelector('[data-result-count]');
const productsGridEl = document.querySelector('[data-products-grid]');
const paginationEl = document.querySelector('[data-pagination]');
const appliedFiltersEl = document.querySelector('[data-applied-filters]');
const sortSelectEl = document.querySelector('[data-sort-select]');
const modalEl = document.querySelector('[data-catalog-modal]');
const modalBackdropEl = modalEl?.querySelector('[data-modal-backdrop]');
const modalCloseButtons = modalEl ? [...modalEl.querySelectorAll('[data-modal-close]')] : [];
const modalImageEl = modalEl?.querySelector('[data-modal-image]');
const modalTitleEl = modalEl?.querySelector('[data-modal-title]');

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (match) => {
  switch (match) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '"':
      return '&quot;';
    case "'":
      return '&#39;';
    default:
      return match;
  }
});

const escapeAttribute = escapeHTML;

const formatNumber = (value) => {
  if (value == null) return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number);
};

const state = {
  categories: [],
  activeMain: null,
  activeSub: null,
  activeBrand: null,
  productsCache: new Map(),
  metaCache: new Map(),
  allProducts: [],
  filteredProducts: [],
  brandOptions: [],
  sort: 'popularity',
  page: 1,
};

const openModal = (product) => {
  if (!modalEl) return;
  const { image, title } = product;
  if (modalImageEl) {
    if (image) {
      modalImageEl.src = image;
      modalImageEl.alt = title ? `Product image for ${title}` : 'Selected product image';
      modalImageEl.classList.remove('is-hidden');
    } else {
      modalImageEl.removeAttribute('src');
      modalImageEl.alt = '';
      modalImageEl.classList.add('is-hidden');
    }
  }
  if (modalTitleEl) {
    modalTitleEl.textContent = title || 'Unlock wholesale pricing';
  }
  modalEl.classList.add('is-active');
  modalEl.removeAttribute('hidden');
  document.body.classList.add('catalog-modal-open');
  const closeBtn = modalEl.querySelector('.catalog-modal__close');
  if (closeBtn) {
    closeBtn.focus({ preventScroll: true });
  }
};

const closeModal = () => {
  if (!modalEl) return;
  modalEl.classList.remove('is-active');
  document.body.classList.remove('catalog-modal-open');
  window.setTimeout(() => {
    if (!modalEl.classList.contains('is-active')) {
      modalEl.setAttribute('hidden', '');
    }
  }, 250);
};

modalBackdropEl?.addEventListener('click', closeModal);
modalCloseButtons.forEach((button) => {
  button.addEventListener('click', closeModal);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeModal();
  }
});

const handleLoadError = (error) => {
  if (resultCountEl) {
    resultCountEl.textContent = 'Failed to load catalog data. Please try again later.';
  }
  // eslint-disable-next-line no-console
  console.error(error);
};

const getActiveCategoryMeta = () => {
  if (!state.activeMain) return null;
  const cachedMeta = state.metaCache.get(state.activeMain);
  if (cachedMeta) {
    return cachedMeta;
  }
  return state.categories.find((category) => category.cat_main_id === state.activeMain) ?? null;
};

const getActiveSubcategoryMeta = () => {
  if (!state.activeSub) return null;
  const categoryMeta = getActiveCategoryMeta();
  if (!categoryMeta?.subs) return null;
  return categoryMeta.subs.find((sub) => sub.cat_sub_id === state.activeSub) ?? null;
};

const getActiveBrandMeta = () => {
  if (!state.activeBrand) return null;
  const option = state.brandOptions.find((brand) => brand.brand_id === state.activeBrand);
  if (option) return option;
  const fallback = state.allProducts.find((product) => product.brand_id === state.activeBrand);
  if (!fallback) return null;
  return {
    brand_id: fallback.brand_id,
    brand: fallback.brand,
    count: state.filteredProducts.filter((product) => product.brand_id === fallback.brand_id).length,
    brand_image: fallback.brand_image,
  };
};

const computeBrandOptions = (products) => {
  const byBrand = new Map();
  products.forEach((product) => {
    const brandId = product.brand_id;
    if (!brandId) return;
    const existing = byBrand.get(brandId) ?? {
      brand_id: brandId,
      brand: product.brand || 'Unknown brand',
      brand_image: product.brand_image || '',
      count: 0,
    };
    existing.count += 1;
    if (!existing.brand && product.brand) {
      existing.brand = product.brand;
    }
    if (!existing.brand_image && product.brand_image) {
      existing.brand_image = product.brand_image;
    }
    byBrand.set(brandId, existing);
  });
  return [...byBrand.values()].sort((a, b) => b.count - a.count).slice(0, 16);
};

const renderBrandFilters = (brandOptions) => {
  if (!brandListEl) return;
  brandListEl.innerHTML = '';

  if (!brandOptions.length) {
    brandFilterContainer?.setAttribute('hidden', '');
    return;
  }

  brandFilterContainer?.removeAttribute('hidden');

  brandOptions.forEach((brand) => {
    const isActive = brand.brand_id === state.activeBrand;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-category-pill catalog-brand-pill';
    button.dataset.brandId = brand.brand_id;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    const label = escapeHTML(brand.brand || 'Brand');
    const count = formatNumber(brand.count);
    button.innerHTML = `
      <span class="catalog-pill__label">${label}</span>
      ${count ? `<span class="catalog-pill__count">${count}</span>` : ''}
    `;
    button.addEventListener('click', () => {
      const willActivate = state.activeBrand !== brand.brand_id;
      state.activeBrand = willActivate ? brand.brand_id : null;
      state.page = 1;
      applyFilters();
    });
    brandListEl.appendChild(button);
  });
};

const renderMainCategories = () => {
  if (!categoryListEl) return;
  categoryListEl.innerHTML = '';
  state.categories.forEach((category) => {
    const isActive = category.cat_main_id === state.activeMain;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-category-pill';
    button.dataset.catMain = category.cat_main_id;
    const label = escapeHTML(category.category_main || 'Category');
    button.innerHTML = `<span class="catalog-pill__label">${label}</span>`;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.addEventListener('click', () => {
      if (state.activeMain === category.cat_main_id) return;
      state.activeMain = category.cat_main_id;
      state.activeSub = null;
      state.activeBrand = null;
      state.page = 1;
      renderMainCategories();
      renderSubcategories();
      loadProductsForCategory(category.cat_main_id).catch(handleLoadError);
    });
    categoryListEl.appendChild(button);
  });
};

const renderSubcategories = () => {
  if (!subcategoryListEl) return;
  subcategoryListEl.innerHTML = '';
  const categoryMeta = getActiveCategoryMeta();
  const subs = categoryMeta?.subs ?? [];

  if (!subs.length) {
    subcategoryListEl.classList.add('is-empty');
    return;
  }

  subcategoryListEl.classList.remove('is-empty');
  subs.forEach((sub) => {
    const isActive = state.activeSub === sub.cat_sub_id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-category-pill catalog-subcategory-pill';
    button.dataset.catSub = sub.cat_sub_id;
    const label = escapeHTML(sub.category_sub || 'Subcategory');
    button.innerHTML = `<span class="catalog-pill__label">${label}</span>`;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.addEventListener('click', () => {
      const willActivate = state.activeSub !== sub.cat_sub_id;
      state.activeSub = willActivate ? sub.cat_sub_id : null;
      state.activeBrand = null;
      state.page = 1;
      renderSubcategories();
      applyFilters();
    });
    subcategoryListEl.appendChild(button);
  });
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
  if (!state.activeMain) {
    resultCountEl.textContent = 'Select a category to see products.';
    return;
  }

  const categoryMeta = getActiveCategoryMeta();
  const categoryName = escapeHTML(categoryMeta?.category_main || 'Selected category');
  const brandMeta = getActiveBrandMeta();
  const brandName = brandMeta?.brand ? escapeHTML(brandMeta.brand) : '';
  const shownLabel = formatNumber(shown);

  if (state.activeSub) {
    const subMeta = getActiveSubcategoryMeta();
    const subName = escapeHTML(subMeta?.category_sub || 'Selected subcategory');
    if (brandName) {
      resultCountEl.innerHTML = `Showing <strong>${shownLabel}</strong> in <strong>${subName}</strong> for <strong>${brandName}</strong>`;
      return;
    }
    resultCountEl.innerHTML = `Showing <strong>${shownLabel}</strong> in <strong>${subName}</strong>`;
    return;
  }

  if (brandName) {
    resultCountEl.innerHTML = `Showing <strong>${shownLabel}</strong> in <strong>${categoryName}</strong> from <strong>${brandName}</strong>`;
    return;
  }

  resultCountEl.innerHTML = `Showing <strong>${shownLabel}</strong> in <strong>${categoryName}</strong>`;
};

const renderAppliedFilters = () => {
  if (!appliedFiltersEl) return;
  appliedFiltersEl.innerHTML = '';

  const filters = [];
  const subMeta = getActiveSubcategoryMeta();
  if (subMeta) {
    filters.push({
      label: subMeta.category_sub || 'Selected subcategory',
      onRemove: () => {
        state.activeSub = null;
        state.page = 1;
        applyFilters();
      },
    });
  }

  const brandMeta = getActiveBrandMeta();
  if (brandMeta) {
    filters.push({
      label: brandMeta.brand || 'Selected brand',
      onRemove: () => {
        state.activeBrand = null;
        state.page = 1;
        applyFilters();
      },
    });
  }

  filters.forEach((filter) => {
    const chip = document.createElement('div');
    chip.className = 'catalog-chip';
    const label = document.createElement('span');
    label.textContent = filter.label;
    chip.appendChild(label);
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `Remove filter ${filter.label}`);
    removeButton.textContent = '×';
    removeButton.addEventListener('click', filter.onRemove);
    chip.appendChild(removeButton);
    appliedFiltersEl.appendChild(chip);
  });
};

const renderProducts = () => {
  if (!productsGridEl) return;
  const start = (state.page - 1) * PAGE_SIZE;
  const pageProducts = state.filteredProducts.slice(start, start + PAGE_SIZE);

  productsGridEl.classList.add('is-transitioning');
  requestAnimationFrame(() => {
    productsGridEl.innerHTML = '';
    if (!state.activeMain) {
      const prompt = document.createElement('div');
      prompt.className = 'catalog-empty';
      prompt.innerHTML = `
        <h3>Select a category</h3>
        <p>Choose a category pill to load matching products.</p>
      `;
      productsGridEl.appendChild(prompt);
      requestAnimationFrame(() => {
        productsGridEl.classList.remove('is-transitioning');
      });
      return;
    }

    if (!pageProducts.length) {
      const empty = document.createElement('div');
      empty.className = 'catalog-empty';
      empty.innerHTML = `
        <h3>No matching products</h3>
        <p>Try a different subcategory or choose another category to keep browsing.</p>
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
        const productTitle = escapeHTML(product.title || 'Untitled product');
        const productBrand = escapeHTML(product.brand ?? 'Unknown brand');
        const productImage = escapeAttribute(product.image || '');
        card.innerHTML = `
          <div class="catalog-product-card__media">
            <img src="${productImage}" alt="${productTitle}" loading="lazy">
            ${badgeLabel ? `<span class="catalog-product-card__badge">${badgeLabel}</span>` : ''}
          </div>
          <div class="catalog-product-card__details">
            <span class="catalog-product-card__brand">${productBrand}</span>
            <h3 class="catalog-product-card__title" title="${escapeAttribute(product.title || 'Product title')}">${productTitle}</h3>
            <div class="catalog-product-card__actions">
              <button
                type="button"
                class="catalog-product-card__cta"
                data-product-image="${productImage}"
                data-product-title="${escapeAttribute(product.title || '')}"
              >
                <span class="catalog-product-card__cta-icon catalog-product-card__cta-icon--locked" aria-hidden="true"></span>
                <span class="catalog-product-card__cta-icon catalog-product-card__cta-icon--unlocked" aria-hidden="true"></span>
                <span class="catalog-product-card__cta-label">Unlock Price</span>
              </button>
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

productsGridEl?.addEventListener('click', (event) => {
  const trigger = event.target.closest('.catalog-product-card__cta');
  if (!trigger) return;
  const image = trigger.dataset.productImage || '';
  const title = trigger.dataset.productTitle || '';
  openModal({
    image,
    title,
  });
});

const renderPagination = () => {
  if (!paginationEl) return;
  paginationEl.innerHTML = '';
  if (!state.activeMain) return;

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
      if (productsGridEl) {
        const { top } = productsGridEl.getBoundingClientRect();
        window.scrollTo({
          top: top + window.scrollY - 120,
          behavior: 'smooth',
        });
      }
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

const applyFilters = () => {
  if (!state.activeMain) {
    state.filteredProducts = [];
    state.brandOptions = [];
    renderBrandFilters([]);
    renderResultCount(0);
    renderAppliedFilters();
    renderProducts();
    renderPagination();
    return;
  }

  const subFiltered = state.allProducts.filter((product) => {
    if (!state.activeSub) return true;
    return product.cat_sub_id === state.activeSub;
  });

  const brandOptions = computeBrandOptions(subFiltered);
  state.brandOptions = brandOptions;
  if (state.activeBrand && !brandOptions.some((brand) => brand.brand_id === state.activeBrand)) {
    state.activeBrand = null;
  }
  renderBrandFilters(brandOptions);

  const filtered = state.activeBrand
    ? subFiltered.filter((product) => product.brand_id === state.activeBrand)
    : subFiltered;

  const sorted = applySort(filtered);
  state.filteredProducts = sorted;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);

  renderResultCount(filtered.length);
  renderAppliedFilters();
  renderProducts();
  renderPagination();
};

const loadProductsForCategory = async (catMainId) => {
  state.brandOptions = [];
  renderBrandFilters([]);
  if (state.productsCache.has(catMainId)) {
    const cached = state.productsCache.get(catMainId);
    const meta = state.metaCache.get(catMainId);
    state.allProducts = cached.products || [];
    renderSubcategories();
    applyFilters();
    return;
  }

  const response = await fetch(`../data/products/${catMainId}.json`);
  if (!response.ok) throw new Error('Unable to load products');
  const data = await response.json();

  state.productsCache.set(catMainId, data);
  if (data.meta) {
    state.metaCache.set(catMainId, data.meta);
    const index = state.categories.findIndex((category) => category.cat_main_id === catMainId);
    if (index >= 0) {
      state.categories[index] = {
        ...state.categories[index],
        ...data.meta,
        subs: data.meta.subs ?? state.categories[index].subs ?? [],
      };
    }
  }

  state.allProducts = data.products || [];
  renderSubcategories();
  applyFilters();
};

const handleSortChange = () => {
  state.sort = sortSelectEl?.value || 'popularity';
  state.page = 1;
  applyFilters();
};

const loadCategories = async () => {
  const response = await fetch('../data/categories/map.json');
  if (!response.ok) throw new Error('Unable to load categories');
  const data = await response.json();
  state.categories = Array.isArray(data) ? data : [];
  state.activeMain = state.categories[0]?.cat_main_id ?? null;
  state.activeSub = null;
  state.page = 1;
  renderMainCategories();
  renderSubcategories();
  if (state.activeMain) {
    await loadProductsForCategory(state.activeMain);
  } else {
    applyFilters();
  }
};

const initCatalog = async () => {
  try {
    sortSelectEl?.addEventListener('change', handleSortChange);
    await loadCategories();
  } catch (error) {
    handleLoadError(error);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCatalog);
} else {
  initCatalog();
}
