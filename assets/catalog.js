const PAGE_SIZE = 30;
const categoryListEl = document.querySelector('[data-category-list]');
const subcategoryListEl = document.querySelector('[data-subcategory-list]');
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

const state = {
  categories: [],
  activeMain: null,
  activeSub: null,
  productsCache: new Map(),
  metaCache: new Map(),
  allProducts: [],
  filteredProducts: [],
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

const renderMainCategories = () => {
  if (!categoryListEl) return;
  categoryListEl.innerHTML = '';
  state.categories.forEach((category) => {
    const isActive = category.cat_main_id === state.activeMain;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-category-pill';
    button.dataset.catMain = category.cat_main_id;
    button.textContent = category.category_main;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.addEventListener('click', () => {
      if (state.activeMain === category.cat_main_id) return;
      state.activeMain = category.cat_main_id;
      state.activeSub = null;
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
    button.textContent = sub.category_sub;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.addEventListener('click', () => {
      const willActivate = state.activeSub !== sub.cat_sub_id;
      state.activeSub = willActivate ? sub.cat_sub_id : null;
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
  const categoryName = categoryMeta?.category_main || 'Selected category';

  if (state.activeSub) {
    const subMeta = getActiveSubcategoryMeta();
    const subName = subMeta?.category_sub || 'Selected subcategory';
    resultCountEl.innerHTML = `Showing <strong>${shown}</strong> in <strong>${subName}</strong>`;
    return;
  }

  resultCountEl.innerHTML = `Showing <strong>${shown}</strong> in <strong>${categoryName}</strong>`;
};

const renderAppliedFilters = () => {
  if (!appliedFiltersEl) return;
  appliedFiltersEl.innerHTML = '';
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
                <span class="catalog-product-card__cta-label">Unlock Wholesale Price</span>
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
    renderResultCount(0);
    renderAppliedFilters();
    renderProducts();
    renderPagination();
    return;
  }

  const filtered = state.allProducts.filter((product) => {
    if (!state.activeSub) return true;
    return product.cat_sub_id === state.activeSub;
  });

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
  if (state.productsCache.has(catMainId)) {
    const cached = state.productsCache.get(catMainId);
    const meta = state.metaCache.get(catMainId);
    state.allProducts = cached.products || [];
    renderSubcategories();
    applyFilters();
    return;
  }

  const response = await fetch(`data/products/${catMainId}.json`);
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
  const response = await fetch('data/categories/map.json');
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
