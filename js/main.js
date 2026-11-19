(() => {
  'use strict';

  /* ========================================================================
     1. Polyfill condicional de Popover API (solo si falta soporte nativo)
     ======================================================================== */
  if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
    import('https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js').catch(() => {});
  }

  /* ========================================================================
     2. Navbar responsiva (inline cuando cabe, popover nativo en móvil)
     ======================================================================== */
  const header = document.getElementById('site-header');
  const headerInner = header?.querySelector('.header-inner');
  const menuButton = document.getElementById('menu-toggle');
  const siteMenu = document.getElementById('site-menu');

  let lastMeasuredWidth = 0;

  function syncNavbarLayout(forceMeasure = false) {
    if (!header || !headerInner || !siteMenu) return;

    const currentWidth = header.clientWidth;
    const isCurrentlyWide = header.classList.contains('is-wide');

    // Evitar thrashing al encoger cuando ya está colapsado
    if (!forceMeasure && !isCurrentlyWide && currentWidth <= lastMeasuredWidth) {
      return;
    }

    const wasOpen =
      !isCurrentlyWide &&
      (siteMenu.matches(':popover-open') || siteMenu.classList.contains(':popover-open'));

    header.classList.add('is-measuring');
    header.classList.add('is-wide');
    siteMenu.removeAttribute('popover');
    if (menuButton) menuButton.hidden = true;

    const fitsInline = headerInner.scrollWidth <= headerInner.clientWidth + 1;

    if (fitsInline) {
      header.classList.add('is-wide');
      siteMenu.removeAttribute('popover');
      if (menuButton) {
        menuButton.hidden = true;
        menuButton.setAttribute('aria-expanded', 'false');
      }
    } else {
      header.classList.remove('is-wide');
      siteMenu.setAttribute('popover', 'auto');
      if (menuButton) {
        menuButton.hidden = false;
      }
      if (wasOpen && typeof siteMenu.showPopover === 'function') {
        try {
          siteMenu.showPopover();
        } catch {
          // Ignorar si ya está abierto o sin soporte
        }
      }
    }

    lastMeasuredWidth = currentWidth;

    requestAnimationFrame(() => {
      header.classList.remove('is-measuring');
    });
  }

  if (header && headerInner && siteMenu) {
    syncNavbarLayout(true);

    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(() => {
        syncNavbarLayout(false);
      });
      resizeObserver.observe(header);
      resizeObserver.observe(siteMenu);
    } else {
      window.addEventListener('resize', () => syncNavbarLayout(true), { passive: true });
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => syncNavbarLayout(true));
    }

    // Mantener aria-expanded sincronizado con el estado del popover
    siteMenu.addEventListener('toggle', (event) => {
      const isOpen = event.newState === 'open';
      menuButton?.setAttribute('aria-expanded', String(isOpen));
    });

    // Cerrar popover al seleccionar un enlace interno en móvil
    siteMenu.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || header.classList.contains('is-wide')) return;
      if (typeof siteMenu.hidePopover === 'function') {
        try {
          siteMenu.hidePopover();
        } catch {
          // Sin acción si ya estaba cerrado
        }
      }
    });
  }

  /* ========================================================================
     3. Sombra sutil en el header al hacer scroll (con sentinel sin scroll-jank)
     ======================================================================== */
  const topSentinel = document.getElementById('top-sentinel');
  if (header && topSentinel && 'IntersectionObserver' in window) {
    const headerObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        header.classList.toggle('is-scrolled', !entry.isIntersecting);
      },
      { threshold: 0 }
    );
    headerObserver.observe(topSentinel);
  }

  /* ========================================================================
     4. Scrollspy discreto para enlaces de navegación
     ======================================================================== */
  const navLinks = Array.from(document.querySelectorAll('.nav-link[href^="#"]'));
  const observedSections = navLinks
    .map((link) => {
      const id = link.getAttribute('href')?.slice(1);
      const section = id ? document.getElementById(id) : null;
      return section ? { link, section } : null;
    })
    .filter(Boolean);

  if (observedSections.length > 0 && 'IntersectionObserver' in window) {
    const visibleMap = new Map();

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibleMap.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let activeId = null;
        let maxRatio = 0;
        for (const [id, ratio] of visibleMap.entries()) {
          if (ratio > maxRatio) {
            maxRatio = ratio;
            activeId = id;
          }
        }

        for (const { link, section } of observedSections) {
          if (activeId && section.id === activeId) {
            link.setAttribute('aria-current', 'location');
          } else {
            link.removeAttribute('aria-current');
          }
        }
      },
      {
        rootMargin: '-22% 0px -58% 0px',
        threshold: [0, 0.25, 0.5, 0.75],
      }
    );

    for (const { section } of observedSections) {
      sectionObserver.observe(section);
    }
  }

  /* ========================================================================
     5. Fallback de aparición suave al hacer scroll (si falta view() timeline)
     ======================================================================== */
  const supportsScrollTimeline =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('(animation-timeline: view()) and (animation-range: entry)');
  const prefersMotion = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

  if (!supportsScrollTimeline && prefersMotion && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-reveal-fallback');
    const revealEls = document.querySelectorAll('.reveal');

    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      {
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.08,
      }
    );

    revealEls.forEach((el) => revealObserver.observe(el));
  }

  /* ========================================================================
     6. Carga elegante de fotografía en Hero (sin icono roto si aún no existe)
     ======================================================================== */
  const heroPhoto = document.getElementById('hero-photo');
  const heroFrame = document.getElementById('hero-photo-frame');

  if (heroPhoto && heroFrame) {
    const showPhoto = () => {
      if (heroPhoto.naturalWidth > 0) {
        heroPhoto.hidden = false;
        heroPhoto.classList.add('is-loaded');
        heroFrame.classList.add('has-photo');
      }
    };

    const showPlaceholder = () => {
      heroPhoto.hidden = true;
      heroPhoto.classList.remove('is-loaded');
      heroFrame.classList.remove('has-photo');
    };

    if (heroPhoto.complete) {
      if (heroPhoto.naturalWidth > 0) showPhoto();
      else showPlaceholder();
    } else {
      heroPhoto.addEventListener('load', showPhoto, { once: true });
      heroPhoto.addEventListener('error', showPlaceholder, { once: true });
    }
  }

  /* ========================================================================
     7. Sugerencia sutil inicial en el tooltip del botón flotante de WhatsApp
     ======================================================================== */
  const waFloatWrap = document.getElementById('wa-float-wrap');
  if (waFloatWrap) {
    const hintDelay = window.setTimeout(() => {
      waFloatWrap.classList.add('show-hint');
      window.setTimeout(() => {
        waFloatWrap.classList.remove('show-hint');
      }, 5000);
    }, 3200);

    waFloatWrap.addEventListener(
      'pointerenter',
      () => {
        window.clearTimeout(hintDelay);
        waFloatWrap.classList.remove('show-hint');
      },
      { once: true }
    );
  }

  /* ========================================================================
     8. Modal nativo <dialog> para Aviso de Privacidad Profesional
     ======================================================================== */
  const privacyDialog = document.getElementById('privacy-dialog');
  const openPrivacyBtn = document.getElementById('open-privacy');
  const closePrivacyBtns = document.querySelectorAll('[data-close-privacy]');

  if (privacyDialog && openPrivacyBtn) {
    openPrivacyBtn.addEventListener('click', () => {
      if (typeof privacyDialog.showModal === 'function') {
        privacyDialog.showModal();
      } else {
        privacyDialog.setAttribute('open', '');
      }
    });

    closePrivacyBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof privacyDialog.close === 'function') {
          privacyDialog.close();
        } else {
          privacyDialog.removeAttribute('open');
        }
      });
    });

    // Light dismiss al hacer clic en el backdrop
    privacyDialog.addEventListener('click', (event) => {
      if (event.target === privacyDialog) {
        privacyDialog.close();
      }
    });
  }

  /* ========================================================================
     9. Año actual en el footer
     ======================================================================== */
  const yearEl = document.getElementById('current-year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
})();
