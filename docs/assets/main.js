const resetWebflowStyles = () => {
  document.querySelectorAll('[data-w-id]').forEach((el) => {
    const style = el.getAttribute('style');
    if (!style) return;
    if (/opacity:\s*0/.test(style)) {
      el.style.opacity = '1';
    }
    if (/transform:/.test(style)) {
      el.style.transform = 'none';
    }
  });
};

const smoothScroll = (targetId) => {
  const target = document.querySelector(targetId);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const attachSmoothScrollHandlers = (root = document, onNavigate) => {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('.nav_menu a, .mobile-nav_content a, .footer2_link, .btn.btn-primary, .btn.btn_reverse').forEach((anchor) => {
    const { hash } = anchor;
    if (!hash || hash.length <= 1) return;
    if (anchor.dataset.smoothScrollBound === 'true') return;
    anchor.dataset.smoothScrollBound = 'true';
    anchor.addEventListener('click', (event) => {
      if (document.getElementById(hash.substring(1))) {
        event.preventDefault();
        smoothScroll(hash);
        if (typeof onNavigate === 'function') {
          onNavigate();
        }
      }
    });
  });
};

const resolveAssetUrl = (relativePath) => {
  const script = document.querySelector('script[src*="assets/main.js"]');
  return script ? new URL(relativePath, script.src).href : `/assets/${relativePath}`;
};

const getFormName = (form, fallback = '') => {
  if (!form) return fallback;
  const name = form.dataset?.formName || '';
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed || fallback;
};

const findFormControl = (form, fieldName, rawValue) => {
  if (!form || !fieldName) return null;
  const controls = form.elements?.[fieldName];
  if (!controls) return null;
  const isCollection = typeof controls.length === 'number' && controls.length > 0 && !controls.tagName;
  if (!isCollection) {
    return controls;
  }
  const controlArray = Array.from(controls);
  const valueString = typeof rawValue === 'string' ? rawValue : String(rawValue);
  return (
    controlArray.find((control) => {
      if ((control.type === 'radio' || control.type === 'checkbox') && !control.checked) {
        return false;
      }
      return control.value === rawValue || control.value === valueString || control.value === valueString.trim();
    }) ||
    controlArray.find((control) => control.checked) ||
    controlArray[0] ||
    null
  );
};

const getControlLabel = (control, form) => {
  if (!control) return '';
  const { id } = control;
  if (id) {
    const labels = form ? Array.from(form.querySelectorAll('label')) : [];
    const matchingLabel = labels.find((label) => label.htmlFor === id);
    if (matchingLabel) {
      return matchingLabel.textContent.trim();
    }
  }
  let node = control;
  while (node && node !== form) {
    if (node.tagName === 'LABEL') {
      return node.textContent.trim();
    }
    node = node.parentElement;
  }
  return '';
};

const normalizeSubmissionValue = (rawValue) => {
  if (typeof File !== 'undefined' && rawValue instanceof File) {
    return rawValue.name || '';
  }
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => normalizeSubmissionValue(item));
  }
  if (typeof rawValue === 'string') {
    return rawValue.trim();
  }
  if (rawValue == null) {
    return '';
  }
  return String(rawValue);
};

const buildFormSubmissionPayload = (form, formData) => {
  if (!formData) {
    return {
      page_url: window.location.href,
      submitted_uct: new Date().toISOString(),
      form: {},
      form_meta: {},
    };
  }

  const entries = typeof formData.entries === 'function' ? Array.from(formData.entries()) : [];
  const { formDict, formMeta } = entries
    .filter(([field]) => typeof field === 'string' && !field.startsWith('_'))
    .reduce(
      (acc, [field, rawValue]) => {
        const control = findFormControl(form, field, rawValue);
        const key = control?.id || field;
        if (!key) return acc;
        const normalizedValue = normalizeSubmissionValue(rawValue);
        if (Object.prototype.hasOwnProperty.call(acc.formDict, key)) {
          const existingValue = acc.formDict[key];
          if (Array.isArray(existingValue)) {
            existingValue.push(normalizedValue);
          } else {
            acc.formDict[key] = [existingValue, normalizedValue];
          }
        } else {
          acc.formDict[key] = normalizedValue;
        }

        if (!Object.prototype.hasOwnProperty.call(acc.formMeta, key)) {
          const labelText = getControlLabel(control, form);
          acc.formMeta[key] = labelText;
        }

        return acc;
      },
      { formDict: {}, formMeta: {} },
    );

  return {
    page_url: window.location.href,
    submitted_uct: new Date().toISOString(),
    form: formDict,
    form_meta: formMeta,
  };
};

const submitRecordedForm = async (formName, form, formData) => {
  if (typeof recordFormSubmission !== 'function') {
    throw new Error('Form handler unavailable');
  }

  const normalizedFormName = typeof formName === 'string' ? formName.trim() : '';
  if (!normalizedFormName) {
    throw new Error('Form submission skipped: invalid form name');
  }

  const payload = buildFormSubmissionPayload(form, formData);
  const result = await recordFormSubmission(normalizedFormName, payload);

  if (result?.skipped) {
    throw new Error(result?.reason || 'Submission skipped');
  }

  if (result?.ok === false) {
    throw new Error(result?.error || 'Submission failed');
  }

  return result;
};

const initCtaForm = () => {
  const form = document.querySelector('.cta_form-grid');
  if (!form) return;

  const statusEl = form.querySelector('.cta_form-status');
  const submitButton = form.querySelector('.cta_form-submit');
  const defaultButtonText = submitButton?.textContent ?? '';

  const updateStatus = (message, state) => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('cta_form-status--success', 'cta_form-status--error');
    if (state) {
      statusEl.classList.add(`cta_form-status--${state}`);
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    updateStatus('');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }
    const formData = new FormData(form);

    try {
      const formName = getFormName(form, 'cta_form');
      await submitRecordedForm(formName, form, formData);
      form.reset();
      updateStatus("Thanks! We'll be in touch soon.", 'success');
    } catch (error) {
      updateStatus('Something went wrong. Please try again or email partners@retailstride.com.', 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonText;
      }
    }
  });
};

const initApplicationForm = () => {
  const form = document.querySelector('[data-application-form]');
  if (!form) return;

  const statusEl = form.querySelector('[data-application-status]');
  const submitButton = form.querySelector('[data-application-submit]');
  const defaultButtonText = submitButton?.textContent ?? '';
  const accordion = form.querySelector('[data-application-accordion]');
  const accordionItems = accordion ? Array.from(accordion.querySelectorAll('.application-accordion__item')) : [];

  const setItemState = (item, expand) => {
    if (!item) return;
    const panel = item.querySelector('.application-accordion__panel');
    const toggle = item.querySelector('.application-accordion__toggle');
    if (!panel || !toggle) return;
    item.classList.toggle('is-open', expand);
    toggle.setAttribute('aria-expanded', expand ? 'true' : 'false');
    panel.hidden = !expand;
  };

  if (accordionItems.length) {
    accordionItems.forEach((item, index) => {
      setItemState(item, index === 0);
      const toggle = item.querySelector('.application-accordion__toggle');
      toggle?.addEventListener('click', () => {
        const isOpen = item.classList.contains('is-open');
        if (!isOpen) {
          accordionItems.forEach((other) => {
            if (other !== item) {
              setItemState(other, false);
            }
          });
        }
        setItemState(item, !isOpen);
      });
    });
  }

  const onlineFieldWrapper = form.querySelector('[data-online-urls]');
  const onlineTextarea = onlineFieldWrapper?.querySelector('textarea');
  const onlineRadios = form.querySelectorAll('input[name="sell_online"]');

  const updateOnlineField = () => {
    if (!onlineFieldWrapper) return;
    const selected = Array.from(onlineRadios).find((radio) => radio.checked)?.value;
    const show = selected === 'Yes';
    onlineFieldWrapper.hidden = !show;
    if (onlineTextarea) {
      onlineTextarea.required = show;
      if (!show) {
        onlineTextarea.value = '';
      }
    }
  };

  if (onlineRadios.length) {
    onlineRadios.forEach((radio) => radio.addEventListener('change', updateOnlineField));
  }
  updateOnlineField();

  const setStatus = (message, state) => {
    if (!statusEl) return;
    statusEl.innerHTML = message;
    statusEl.classList.remove('application-status--success', 'application-status--error');
    if (state) {
      statusEl.classList.add(`application-status--${state}`);
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';
    }

    const formData = new FormData(form);
    const formName = getFormName(form, 'retailer_app');

    try {
      await submitRecordedForm(formName, form, formData);

      form.reset();
      updateOnlineField();
      accordionItems.forEach((item, index) => setItemState(item, index === 0));

      setStatus(
        'Thank you — your application has been received. Our onboarding team reviews all submissions within 3 business days. Approved applicants will receive login credentials for wholesale access. <a href="#what-happens-next">What happens next</a>.',
        'success',
      );
    } catch (error) {
      setStatus('Something went wrong. Please try again or email partners@retailstride.com.', 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonText;
      }
    }
  });
};

const NAV_PATH_MAP = {
  '/': 'home',
  '/brands/': 'brands',
  '/retailers/': 'retailers',
  '/catalog/': 'catalog',
  '/apply/': 'retailers',
};

const normalizePathname = (pathname) => {
  if (typeof pathname !== 'string' || pathname.length === 0) {
    return '/';
  }
  const noIndex = pathname.replace(/index\.html$/i, '');
  if (noIndex === '' || noIndex === '/') {
    return '/';
  }
  return noIndex.endsWith('/') ? noIndex : `${noIndex}/`;
};

const determineNavCurrentKey = (container) => {
  if (!container || !container.dataset) return '';
  const explicit = (container.dataset.navCurrent || '').trim();
  if (explicit) {
    return explicit;
  }
  if (typeof window === 'undefined') return '';
  const normalizedPath = normalizePathname(window.location.pathname || '/');
  const directMatch = NAV_PATH_MAP[normalizedPath];
  if (directMatch) {
    return directMatch;
  }
  let fallbackKey = '';
  let fallbackLength = 0;
  Object.entries(NAV_PATH_MAP).forEach(([path, key]) => {
    if (path === '/') return;
    if (normalizedPath.endsWith(path) && path.length > fallbackLength) {
      fallbackKey = key;
      fallbackLength = path.length;
    }
  });
  if (fallbackKey) {
    return fallbackKey;
  }
  if (normalizedPath === '/' || normalizedPath.endsWith('/')) {
    return NAV_PATH_MAP['/'] || '';
  }
  return '';
};

const applyNavCurrentState = (navRoot, currentKey) => {
  if (!navRoot) return;
  const normalizedKey = typeof currentKey === 'string' ? currentKey.trim() : '';

  const navLinks = navRoot.querySelectorAll('[data-nav-link]');
  navLinks.forEach((link) => {
    if (!link.dataset.navOriginalHref) {
      const originalHref = link.getAttribute('href');
      if (originalHref != null) {
        link.dataset.navOriginalHref = originalHref;
      }
    }
    link.classList.remove('nav_is_current', 'w--current');
    link.removeAttribute('aria-current');
    link.removeAttribute('aria-disabled');
    const originalHref = link.dataset.navOriginalHref;
    if (originalHref != null && originalHref !== '') {
      link.setAttribute('href', originalHref);
    } else {
      link.removeAttribute('href');
    }
  });

  if (normalizedKey) {
    navRoot.querySelectorAll(`[data-nav-link="${normalizedKey}"]`).forEach((link) => {
      link.classList.add('nav_is_current');
      if (link.classList.contains('w-nav-link')) {
        link.classList.add('w--current');
      }
      link.setAttribute('aria-current', 'page');
      link.setAttribute('aria-disabled', 'true');
      link.removeAttribute('href');
    });
  }

  const isHome = normalizedKey === 'home';
  navRoot.querySelectorAll('[data-nav-brand]').forEach((brandLink) => {
    if (isHome) {
      brandLink.classList.add('w--current');
      brandLink.setAttribute('aria-current', 'page');
    } else {
      brandLink.classList.remove('w--current');
      brandLink.removeAttribute('aria-current');
    }
  });
};

const applyNavCtaOverrides = (navRoot, { label, href }) => {
  if (!navRoot) return;
  const normalizedLabel = typeof label === 'string' ? label.trim() : '';
  const normalizedHref = typeof href === 'string' ? href.trim() : '';
  if (!normalizedLabel && !normalizedHref) return;
  navRoot.querySelectorAll('[data-nav-cta]').forEach((ctaLink) => {
    if (normalizedLabel) {
      ctaLink.textContent = normalizedLabel;
    }
    if (normalizedHref) {
      ctaLink.setAttribute('href', normalizedHref);
    }
  });
};

const initNavigation = async () => {
  const containers = document.querySelectorAll('[data-navbar]');
  if (!containers.length) {
    return () => {};
  }

  const navUrl = resolveAssetUrl('nav.html');

  const response = await fetch(navUrl);
  if (!response.ok) {
    throw new Error(`Failed to load navigation partial: ${response.status}`);
  }

  const navHtml = await response.text();
  containers.forEach((container) => {
    container.innerHTML = navHtml;
    const navRoot = container.querySelector('[data-nav-root]') || container;
    const currentKey = determineNavCurrentKey(container);
    applyNavCurrentState(navRoot, currentKey);
    applyNavCtaOverrides(navRoot, {
      label: container.dataset.navCtaLabel,
      href: container.dataset.navCtaHref,
    });
  });

  const navRoot = document.querySelector('[data-nav-root]');
  const navMenu = navRoot?.querySelector('.nav_menu') || document.querySelector('.nav_menu');
  const navButton = navRoot?.querySelector('.navbar1_menu-button') || document.querySelector('.navbar1_menu-button');
  const mobileNav = navRoot?.querySelector('.mobile-nav_component') || document.querySelector('.mobile-nav_component');
  const overlay = document.getElementById('w-nav-overlay-0');
  let bodyScrollLocked = false;
  let previousBodyOverflow = '';

  const closeNav = () => {
    if (navMenu) navMenu.classList.remove('w--open');
    if (mobileNav) {
      mobileNav.classList.remove('w--open');
      mobileNav.setAttribute('aria-hidden', 'true');
      const mobileNavContent = mobileNav.querySelector('.mobile-nav_content');
      if (mobileNavContent) {
        mobileNavContent.scrollTop = 0;
      }
    }
    if (navButton) {
      navButton.classList.remove('w--open');
      navButton.setAttribute('aria-expanded', 'false');
    }
    if (overlay) overlay.style.display = 'none';
    if (bodyScrollLocked) {
      document.body.style.overflow = previousBodyOverflow;
      bodyScrollLocked = false;
    }
  };

  if (mobileNav) {
    mobileNav.setAttribute('aria-hidden', 'true');
  }

  if (navButton) {
    navButton.addEventListener('click', () => {
      const isOpen = !navButton.classList.contains('w--open');
      navButton.classList.toggle('w--open', isOpen);
      if (navMenu) navMenu.classList.toggle('w--open', isOpen);
      if (mobileNav) {
        mobileNav.classList.toggle('w--open', isOpen);
        mobileNav.setAttribute('aria-hidden', String(!isOpen));
      }
      navButton.setAttribute('aria-expanded', String(isOpen));
      if (overlay) overlay.style.display = isOpen ? 'block' : 'none';
      if (isOpen) {
        if (!bodyScrollLocked) {
          previousBodyOverflow = document.body.style.overflow;
          bodyScrollLocked = true;
        }
        document.body.style.overflow = 'hidden';
      } else if (bodyScrollLocked) {
        document.body.style.overflow = previousBodyOverflow;
        bodyScrollLocked = false;
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeNav);
  }

  containers.forEach((container) => {
    attachSmoothScrollHandlers(container, closeNav);
  });

  return closeNav;
};

const loadFooter = async (onNavigate) => {
  const containers = document.querySelectorAll('[data-footer]');
  if (!containers.length) return;

  const footerUrl = resolveAssetUrl('footer.html');

  try {
    const response = await fetch(footerUrl);
    if (!response.ok) {
      throw new Error(`Failed to load footer partial: ${response.status}`);
    }
    const footerHtml = await response.text();
    containers.forEach((container) => {
      container.innerHTML = footerHtml;
      attachSmoothScrollHandlers(container, onNavigate);
    });
  } catch (error) {
    console.error('Footer loading failed', error);
  }
};

const loadLoginModal = async () => {
  const containers = document.querySelectorAll('[data-login-modal-container]');
  if (!containers.length) return;

  const modalUrl = resolveAssetUrl('login-modal.html');

  try {
    const response = await fetch(modalUrl);
    if (!response.ok) {
      throw new Error(`Failed to load login modal partial: ${response.status}`);
    }
    const modalHtml = await response.text();
    containers.forEach((container) => {
      container.innerHTML = modalHtml;
    });
  } catch (error) {
    console.error('Login modal loading failed', error);
  }
};

const initLoginModal = (closeNav) => {
  if (document.body.dataset.loginModalInitialized === 'true') return;
  const loginModal = document.querySelector('[data-login-modal]');
  if (!loginModal) return;
  document.body.dataset.loginModalInitialized = 'true';

  const loginStatus = loginModal.querySelector('[data-login-status]');
  const loginForm = loginModal.querySelector('[data-login-form]');
  const loginCloseElements = loginModal.querySelectorAll('[data-login-close]');
  const firstField = loginModal.querySelector('[data-login-first]');
  const loginSubmitButton = loginForm?.querySelector('[type="submit"]');
  const loginDefaultButtonText = loginSubmitButton?.textContent ?? '';
  let lastFocusedTrigger = null;
  let closeTimeout = null;

  const resetStatus = () => {
    if (!loginStatus) return;
    loginStatus.textContent = '';
    loginStatus.classList.remove('is-visible');
  };

  const closeLoginModal = () => {
    if (loginModal.hidden) return;
    loginModal.classList.remove('is-active');
    document.body.classList.remove('login-modal-open');
    if (closeTimeout) {
      clearTimeout(closeTimeout);
    }
    closeTimeout = window.setTimeout(() => {
      if (!loginModal.classList.contains('is-active')) {
        loginModal.hidden = true;
      }
    }, 280);
    if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
      lastFocusedTrigger.focus({ preventScroll: true });
    }
  };

  const openLoginModal = (trigger) => {
    lastFocusedTrigger = trigger instanceof HTMLElement ? trigger : null;
    resetStatus();
    if (closeTimeout) {
      clearTimeout(closeTimeout);
    }
    loginModal.hidden = false;
    requestAnimationFrame(() => {
      loginModal.classList.add('is-active');
    });
    document.body.classList.add('login-modal-open');
    if (typeof closeNav === 'function') {
      closeNav();
    }
    if (firstField) {
      setTimeout(() => firstField.focus({ preventScroll: true }), 120);
    }
  };

  loginCloseElements.forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      closeLoginModal();
    });
  });

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      resetStatus();

      if (loginSubmitButton) {
        loginSubmitButton.disabled = true;
        loginSubmitButton.textContent = 'Submitting...';
      }

      const formData = new FormData(loginForm);
      const formName = getFormName(loginForm, 'login_modal');

      try {
        await submitRecordedForm(formName, loginForm, formData);
        loginForm.reset();
        if (loginStatus) {
          loginStatus.textContent =
            'Portal access is provided to approved partners. Please contact us to activate your login.';
          loginStatus.classList.add('is-visible');
        }
      } catch (error) {
        console.error('Login modal submission failed:', error);
        if (loginStatus) {
          loginStatus.textContent =
            'Something went wrong. Please try again or email partners@retailstride.com for assistance.';
          loginStatus.classList.add('is-visible');
        }
      } finally {
        if (loginSubmitButton) {
          loginSubmitButton.disabled = false;
          loginSubmitButton.textContent = loginDefaultButtonText;
        }
      }
    });
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-login-trigger]');
    if (!trigger) return;
    event.preventDefault();
    openLoginModal(trigger);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !loginModal.hidden) {
      closeLoginModal();
    }
  });

  loginModal.addEventListener('click', (event) => {
    if (event.target === loginModal) {
      closeLoginModal();
    }
  });

  document.addEventListener('login:open', (event) => {
    const trigger = event.detail?.trigger ?? null;
    openLoginModal(trigger);
  });
};

const initCatalogPreview = () => {
  const section = document.querySelector('[data-preview-section]');
  if (!section) return;

  const pillsContainer = section.querySelector('[data-preview-category-list]');
  const grid = section.querySelector('[data-preview-grid]');
  const statusEl = section.querySelector('[data-preview-status]');
  if (!pillsContainer || !grid || !statusEl) return;

  const gridId = grid.id || 'catalog-preview-grid';
  if (!grid.id) {
    grid.id = gridId;
  }

  const MAX_STAGGERED_ITEMS = 12;
  let categories = [];
  let activeIndex = 0;
  let pillButtons = [];

  const setStatus = (message) => {
    const text = message ? String(message) : '';
    statusEl.textContent = text;
    statusEl.hidden = text.length === 0;
  };

  const sanitizeProduct = (product) => {
    if (!product || typeof product !== 'object') return null;
    const brand = typeof product.brand === 'string' ? product.brand.trim() : '';
    const title = typeof product.title === 'string' ? product.title.trim() : '';
    const image = typeof product.image === 'string' ? product.image.trim() : '';
    if (!brand && !title && !image) return null;
    return { brand, title, image };
  };

  const createProductCard = (product, index) => {
    const card = document.createElement('article');
    card.className = 'preview_card';
    card.dataset.loginTrigger = '';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.style.setProperty('--preview-animation-delay', `${Math.min(index, MAX_STAGGERED_ITEMS) * 0.06}s`);
    const ariaLabelParts = [];
    if (product.brand) ariaLabelParts.push(product.brand);
    if (product.title) ariaLabelParts.push(product.title);
    const ariaLabel =
      ariaLabelParts.length > 0
        ? `${ariaLabelParts.join(' – ')}. Opens login modal.`
        : 'Open catalog login modal.';
    card.setAttribute('aria-label', ariaLabel);

    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'preview_card-image';

    if (product.image) {
      const image = document.createElement('img');
      image.src = product.image;
      image.alt = product.title || product.brand || 'Catalog product';
      image.loading = 'lazy';
      image.decoding = 'async';
      imageWrapper.appendChild(image);
    } else {
      imageWrapper.classList.add('preview_card-image--empty');
      const placeholder = document.createElement('div');
      placeholder.className = 'preview_card-placeholder';
      placeholder.textContent = 'Image coming soon';
      imageWrapper.appendChild(placeholder);
    }

    const content = document.createElement('div');
    content.className = 'preview_card-content';

    const brandEl = document.createElement('div');
    brandEl.className = 'preview_card-brand';
    brandEl.textContent = product.brand || 'Featured Brand';

    const titleEl = document.createElement('div');
    titleEl.className = 'preview_card-title';
    titleEl.textContent = product.title || 'Product details coming soon.';

    content.append(brandEl, titleEl);
    card.append(imageWrapper, content);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const loginEvent = new CustomEvent('login:open', {
          bubbles: false,
          detail: { trigger: card },
        });
        document.dispatchEvent(loginEvent);
      }
    });

    return card;
  };

  const renderProducts = () => {
    grid.innerHTML = '';
    const category = categories[activeIndex];
    if (!category) {
      grid.classList.add('is-empty');
      setStatus('Preview currently unavailable. Explore the full catalog for more.');
      return;
    }

    const products = category.products;
    if (!products.length) {
      grid.classList.add('is-empty');
      setStatus(`No preview products available for ${category.name}.`);
      return;
    }

    grid.classList.remove('is-empty');
    setStatus('');
    grid.scrollLeft = 0;
    products.forEach((product, index) => {
      const card = createProductCard(product, index);
      grid.appendChild(card);
      requestAnimationFrame(() => {
        card.classList.add('is-visible');
      });
    });
  };

  const updatePillStates = () => {
    let activeButtonId = '';
    pillButtons.forEach((button, index) => {
      const isActive = index === activeIndex;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.tabIndex = isActive ? 0 : -1;
      if (isActive) {
        activeButtonId = button.id || '';
      }
    });
    if (activeButtonId) {
      grid.setAttribute('aria-labelledby', activeButtonId);
    } else {
      grid.removeAttribute('aria-labelledby');
    }
  };

  const setActiveCategory = (index, { focus } = { focus: false }) => {
    if (index < 0 || index >= categories.length) return;
    const isSameCategory = index === activeIndex;
    if (!isSameCategory) {
      activeIndex = index;
      updatePillStates();
      renderProducts();
    } else {
      updatePillStates();
    }
    if (focus) {
      const target = pillButtons[index];
      if (target && typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
    }
  };

  const handlePillKeydown = (event) => {
    if (!pillButtons.length) return;
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Enter', ' '];
    if (!keys.includes(event.key)) return;

    const currentIndex = pillButtons.indexOf(document.activeElement);
    if (event.key === 'Enter' || event.key === ' ') {
      if (currentIndex >= 0) {
        event.preventDefault();
        setActiveCategory(currentIndex);
      }
      return;
    }

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % pillButtons.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + pillButtons.length) % pillButtons.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = pillButtons.length - 1;
    }

    if (nextIndex < 0 || nextIndex >= pillButtons.length) return;
    event.preventDefault();
    setActiveCategory(nextIndex, { focus: true });
  };

  const buildPills = () => {
    pillsContainer.innerHTML = '';
    pillButtons = [];
    if (!categories.length) {
      pillsContainer.hidden = true;
      return;
    }

    pillsContainer.hidden = false;
    pillsContainer.setAttribute('aria-orientation', 'horizontal');

    pillButtons = categories.map((category, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'catalog-preview_pill';
      button.dataset.previewIndex = String(index);
      button.id = `${gridId}-pill-${index}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', gridId);
      button.textContent = category.name || `Category ${index + 1}`;
      button.addEventListener('click', () => {
        setActiveCategory(index);
      });
      pillsContainer.appendChild(button);
      return button;
    });

    if (!pillsContainer.dataset.previewKeyboardBound) {
      pillsContainer.dataset.previewKeyboardBound = 'true';
      pillsContainer.addEventListener('keydown', handlePillKeydown);
    }

    updatePillStates();
  };

  const parseCategories = (data) => {
    if (!Array.isArray(data)) return [];
    const parsed = [];
    data.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      Object.entries(entry).forEach(([name, products]) => {
        const label = typeof name === 'string' ? name.trim() : '';
        const productList = Array.isArray(products) ? products.map(sanitizeProduct).filter(Boolean) : [];
        if (!label || !productList.length) return;
        parsed.push({
          name: label,
          products: productList,
        });
      });
    });
    return parsed;
  };

  const loadPreview = async () => {
    setStatus('Loading preview…');
    grid.classList.add('is-empty');
    try {
      const previewUrl = resolveAssetUrl('../data/categories/preview.json');
      const response = await fetch(previewUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch catalog preview: ${response.status}`);
      }
      const data = await response.json();
      categories = parseCategories(data);
      if (!categories.length) {
        setStatus('Preview currently unavailable. Explore the full catalog for more.');
        pillsContainer.hidden = true;
        pillButtons = [];
        grid.removeAttribute('aria-labelledby');
        return;
      }
      activeIndex = 0;
      buildPills();
      renderProducts();
    } catch (error) {
      console.error('Catalog preview loading failed', error);
      setStatus('Unable to load the catalog preview right now. Explore the full catalog instead.');
      pillsContainer.hidden = true;
      grid.classList.add('is-empty');
      pillButtons = [];
      grid.removeAttribute('aria-labelledby');
    }
  };

  loadPreview();
};

document.addEventListener('DOMContentLoaded', () => {
  resetWebflowStyles();
  initCtaForm();
  initApplicationForm();
  const finalizeNavigation = (closeNavCandidate) => {
    const closeNav = typeof closeNavCandidate === 'function' ? closeNavCandidate : () => {};
    attachSmoothScrollHandlers(document, closeNav);
    loadFooter(closeNav);
    initLoginModal(closeNav);
    loadLoginModal().then(() => initLoginModal(closeNav));
  };

  initNavigation()
    .then((closeNav) => {
      finalizeNavigation(closeNav);
    })
    .catch((error) => {
      console.error('Navigation initialization failed', error);
      finalizeNavigation();
    });
  initCatalogPreview();

  const animatedItems = document.querySelectorAll('.animate-item');
  if (animatedItems.length) {
    const animateObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = parseFloat(el.dataset.animateDelay || '0');
        setTimeout(() => {
          el.classList.add('is-visible');
        }, delay * 1000);
        observer.unobserve(el);
      });
    }, { threshold: 0.2 });
    animatedItems.forEach((el) => animateObserver.observe(el));
  }
  document.querySelectorAll('.mobile-dropdown').forEach((dropdown) => {
    const toggle = dropdown.querySelector('.mobile-dropdown-toggle');
    const list = dropdown.querySelector('.nav_dropdown');
    if (!toggle || !list) return;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', (!expanded).toString());
      dropdown.classList.toggle('is-open', !expanded);
      list.classList.toggle('w--open', !expanded);
    });
  });

  document.querySelectorAll('.alt-light-accordion_component').forEach((component) => {
    const items = component.querySelectorAll('.alt-light-accordion_item');
    items.forEach((item, index) => {
      const question = item.querySelector('.alt-light-accordion_question');
      const body = item.querySelector('.alt-light-accordion_body');
      const icon = item.querySelector('.alt-light-accordion_expand svg');
      if (!question || !body) return;
      item.style.opacity = '1';
      item.style.transform = 'none';
      if (index === 0) {
        question.setAttribute('aria-expanded', 'true');
        body.style.height = body.scrollHeight + 'px';
        if (icon) icon.style.transform = 'rotate(-45deg)';
      } else {
        question.setAttribute('aria-expanded', 'false');
        body.style.height = '0px';
        if (icon) icon.style.transform = 'rotate(0deg)';
      }
      question.addEventListener('click', () => {
        const expanded = question.getAttribute('aria-expanded') === 'true';
        items.forEach((other) => {
          if (other === item) return;
          const otherQuestion = other.querySelector('.alt-light-accordion_question');
          const otherBody = other.querySelector('.alt-light-accordion_body');
          const otherIcon = other.querySelector('.alt-light-accordion_expand svg');
          if (otherQuestion && otherBody) {
            otherQuestion.setAttribute('aria-expanded', 'false');
            otherBody.style.height = '0px';
          }
          if (otherIcon) otherIcon.style.transform = 'rotate(0deg)';
        });
        if (!expanded) {
          question.setAttribute('aria-expanded', 'true');
          body.style.height = body.scrollHeight + 'px';
          if (icon) icon.style.transform = 'rotate(-45deg)';
        } else {
          question.setAttribute('aria-expanded', 'false');
          body.style.height = '0px';
          if (icon) icon.style.transform = 'rotate(0deg)';
        }
      });
    });
  });

  document.querySelectorAll('.hover-accordon5_component').forEach((component) => {
    const rows = Array.from(component.querySelectorAll('.accordion5_row'));
    let currentActive = null;
    const toggleElement = (element, active, fallbackDisplay = 'block', instantHide = false) => {
      if (!element) return;
      const defaultDisplay = element.dataset.defaultDisplay || fallbackDisplay;
      if (!element.dataset.defaultDisplay) {
        element.dataset.defaultDisplay = defaultDisplay;
      }
      const token = Number(element.dataset.toggleToken || '0') + 1;
      element.dataset.toggleToken = String(token);
      const show = () => {
        element.dataset.toggleState = 'show';
        element.style.display = element.dataset.defaultDisplay;
        requestAnimationFrame(() => {
          element.classList.add('is-visible');
        });
      };
      const hide = () => {
        element.dataset.toggleState = 'hide';
        if (instantHide) {
          element.classList.remove('is-visible');
          element.style.display = 'none';
          return;
        }
        const handleTransitionEnd = (event) => {
          if (event.target !== element) return;
          if (element.dataset.toggleToken !== String(token)) return;
          element.style.display = 'none';
        };
        const startHide = () => {
          element.addEventListener('transitionend', handleTransitionEnd, { once: true });
          element.classList.remove('is-visible');
        };
        requestAnimationFrame(startHide);
        setTimeout(() => {
          if (element.dataset.toggleToken === String(token)) {
            element.style.display = 'none';
          }
        }, 600);
      };
      if (active) {
        show();
      } else {
        hide();
      }
    };
    const applyState = (row, isActive, instantHide = false) => {
      row.classList.toggle('active', isActive);
      row.style.opacity = '1';
      row.style.transform = 'none';
      toggleElement(row.querySelector('.accordion5_paragraph'), isActive, 'block', instantHide);
      toggleElement(row.querySelector('.accordion5_rel-parent'), isActive, 'block', instantHide);
      toggleElement(row.querySelector('.services_arrow-link'), isActive, 'flex', instantHide);
    };
    const activateRow = (target) => {
      if (!target || target === currentActive) return;
      applyState(target, true);
      if (currentActive) {
        applyState(currentActive, false, true);
      }
      currentActive = target;
    };
    const tabsComponents = Array.from(document.querySelectorAll('.basic-tabs_component'));
    const attachLearnMore = (row) => {
      const link = row.querySelector('.services_learn-more');
      const tabTarget = row.dataset.tabTarget || link?.dataset.tabTarget;
      if (!link) return;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (tabTarget) {
          tabsComponents.forEach((tabs) => {
            tabs.dispatchEvent(new CustomEvent('changeTab', { detail: { tabName: tabTarget } }));
          });
        }
        smoothScroll('#how-we-work');
      });
    };
    if (rows.length) {
      currentActive = rows[0];
      applyState(currentActive, true);
      rows.forEach((row) => {
        if (row !== currentActive) {
          applyState(row, false);
        }
      });
    }
    rows.forEach((row) => {
      row.addEventListener('click', () => activateRow(row));
      attachLearnMore(row);
    });
  });

  document.querySelectorAll('.basic-tabs_component').forEach((tabs) => {
    const links = tabs.querySelectorAll('.w-tab-link');
    const panes = tabs.querySelectorAll('.w-tab-pane');
    if (!links.length || !panes.length) return;

    const setActive = (targetLink) => {
      const targetName = targetLink.getAttribute('data-w-tab');
      if (targetName) {
        tabs.setAttribute('data-current', targetName);
      }
      links.forEach((link) => {
        const isActive = link === targetLink;
        link.classList.toggle('w--current', isActive);
        link.setAttribute('aria-selected', String(isActive));
        link.setAttribute('tabindex', isActive ? '0' : '-1');
        if (isActive) {
          link.style.opacity = '1';
          link.style.transform = 'none';
        }
      });
      panes.forEach((pane) => {
        const match = pane.getAttribute('data-w-tab');
        const isActive = match === targetName;
        pane.classList.toggle('w--tab-active', isActive);
        pane.style.display = isActive ? 'block' : 'none';
        pane.setAttribute('aria-hidden', String(!isActive));
        if (!isActive) {
          pane.setAttribute('hidden', 'true');
        } else {
          pane.removeAttribute('hidden');
        }
      });
    };

    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        setActive(link);
      });
    });

    tabs.addEventListener('changeTab', (event) => {
      const tabName = event.detail?.tabName;
      if (!tabName) return;
      const targetLink = Array.from(links).find(
        (link) => link.getAttribute('data-w-tab') === tabName || link.id === tabName,
      );
      if (targetLink) {
        setActive(targetLink);
        if (typeof targetLink.focus === 'function') {
          targetLink.focus({ preventScroll: true });
        }
      }
    });

    setActive(links[0]);
  });

  document.querySelectorAll('.accordion__style2').forEach((accordion) => {
    const blocks = Array.from(accordion.querySelectorAll('.accordion__block'));

    const setBlockState = (block, shouldOpen) => {
      const title = block.querySelector('.accordion__title');
      const content = block.querySelector('.accordion__content');
      if (!title || !content) return;

      block.classList.toggle('active', shouldOpen);
      title.classList.toggle('active', shouldOpen);
      content.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');

      if (shouldOpen) {
        content.style.maxHeight = content.scrollHeight + 'px';
        content.style.opacity = '1';
      } else {
        content.style.maxHeight = '0px';
        content.style.opacity = '0';
      }
    };

    blocks.forEach((block) => {
      const title = block.querySelector('.accordion__title');
      const content = block.querySelector('.accordion__content');
      if (!title || !content) return;

      const blockIsActive = block.classList.contains('active');
      content.style.maxHeight = blockIsActive ? `${content.scrollHeight}px` : '0px';
      content.style.opacity = blockIsActive ? '1' : '0';
      content.setAttribute('aria-hidden', blockIsActive ? 'false' : 'true');
      title.classList.toggle('active', blockIsActive);

      title.addEventListener('click', () => {
        const isActive = block.classList.contains('active');

        blocks.forEach((other) => {
          if (other !== block) {
            setBlockState(other, false);
          }
        });

        setBlockState(block, !isActive);
      });
    });

    window.addEventListener('resize', () => {
      blocks.forEach((block) => {
        if (!block.classList.contains('active')) return;
        const content = block.querySelector('.accordion__content');
        if (!content) return;
        content.style.maxHeight = `${content.scrollHeight}px`;
      });
    });
  });

  const counters = document.querySelectorAll('.counter');
  if (counters.length) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const targetValue = Number(el.dataset.count || el.textContent || 0);
        const startValue = el.dataset.start !== undefined ? Number(el.dataset.start) : 0;
        const duration = Number(el.dataset.duration || '1200');
        const diff = targetValue - startValue;
        const isCountdown = diff < 0;
        let start = null;

        const step = (timestamp) => {
          if (!start) start = timestamp;
          const progress = Math.min((timestamp - start) / duration, 1);
          const currentValue = isCountdown
            ? Math.ceil(startValue + diff * progress)
            : Math.floor(startValue + diff * progress);
          el.textContent = currentValue.toLocaleString();
          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            el.textContent = targetValue.toLocaleString();
          }
        };

        requestAnimationFrame(step);
        obs.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach((counter) => observer.observe(counter));
  }
});
