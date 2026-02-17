// F.R.I.D.A.Y. Site JavaScript
// Modern interactions and animations

(function () {
  'use strict';

  // DOM Elements
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const copyBtns = document.querySelectorAll('.copy-btn');

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    initNavbar();
    initTabs();
    initCopyButtons();
    initScrollAnimations();
    initSmoothScroll();
    initPerformanceMonitoring();
  });

  // Navbar scroll effect
  function initNavbar() {
    let lastScroll = 0;

    window.addEventListener(
      'scroll',
      function () {
        const currentScroll = window.pageYOffset;

        // Add/remove scrolled class
        if (currentScroll > 50) {
          navbar.classList.add('scrolled');
        } else {
          navbar.classList.remove('scrolled');
        }

        // Hide/show navbar on scroll
        if (currentScroll > lastScroll && currentScroll > 100) {
          navbar.style.transform = 'translateY(-100%)';
        } else {
          navbar.style.transform = 'translateY(0)';
        }

        lastScroll = currentScroll;
      },
      { passive: true }
    );

    // Mobile menu toggle
    if (navToggle) {
      navToggle.addEventListener('click', function () {
        this.classList.toggle('active');
        navMenu.classList.toggle('active');
        document.body.classList.toggle('menu-open');
      });
    }
  }

  // Tab functionality for setup section
  function initTabs() {
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', function () {
        const tabId = this.dataset.tab;

        // Remove active from all
        tabBtns.forEach((b) => b.classList.remove('active'));
        tabPanels.forEach((p) => p.classList.remove('active'));

        // Add active to clicked
        this.classList.add('active');
        const panel = document.getElementById(tabId);
        if (panel) {
          panel.classList.add('active');
        }
      });
    });
  }

  // Copy to clipboard functionality
  function initCopyButtons() {
    copyBtns.forEach((btn) => {
      btn.addEventListener('click', async function () {
        const panel = this.closest('.tab-panel');
        const codeBlock = panel?.querySelector('code');

        if (codeBlock) {
          try {
            await navigator.clipboard.writeText(codeBlock.textContent);

            // Show feedback
            const originalHTML = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check"></i>';
            this.style.color = 'var(--success)';

            setTimeout(() => {
              this.innerHTML = originalHTML;
              this.style.color = '';
            }, 2000);
          } catch (err) {
            console.error('Failed to copy:', err);
          }
        }
      });
    });
  }

  // Scroll animations using Intersection Observer
  function initScrollAnimations() {
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');

          // Optional: Unobserve after animation
          // observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Observe elements for reveal animations
    const revealElements = document.querySelectorAll(
      '.feature-card, .use-case-card, .community-card, .section-header, .arch-layer, .arch-core, .arch-bottom'
    );

    revealElements.forEach((el, index) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${index * 0.05}s`;
      observer.observe(el);
    });
  }

  // Smooth scroll for anchor links
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');

        if (targetId === '#') return;

        const targetElement = document.querySelector(targetId);

        if (targetElement) {
          e.preventDefault();

          // Close mobile menu if open
          if (navMenu?.classList.contains('active')) {
            navToggle?.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.classList.remove('menu-open');
          }

          // Calculate offset for fixed navbar
          const navHeight = navbar?.offsetHeight || 0;
          const targetPosition = targetElement.offsetTop - navHeight - 20;

          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth',
          });
        }
      });
    });
  }

  // Performance monitoring
  function initPerformanceMonitoring() {
    // Log page load time
    window.addEventListener('load', () => {
      const timing = performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;

      if (loadTime > 0) {
        console.log(`🚀 Page loaded in ${loadTime}ms`);
      }
    });

    // Optimize scroll events with requestAnimationFrame
    let ticking = false;

    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );
  }

  // Add ripple effect to buttons
  document.addEventListener('click', function (e) {
    const button = e.target.closest('.btn');

    if (button && !button.classList.contains('tab-btn')) {
      const rect = button.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const ripple = document.createElement('span');
      ripple.style.cssText = `
                position: absolute;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                pointer-events: none;
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                width: 100px;
                height: 100px;
                left: ${x - 50}px;
                top: ${y - 50}px;
            `;

      button.style.position = 'relative';
      button.style.overflow = 'hidden';
      button.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    }
  });

  // Add ripple animation keyframes
  const style = document.createElement('style');
  style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        .reveal {
            opacity: 0;
            transform: translateY(30px);
            transition: opacity 0.6s ease, transform 0.6s ease;
        }
        
        .reveal.active {
            opacity: 1;
            transform: translateY(0);
        }
        
        .nav-menu.active {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--bg-secondary);
            padding: 1rem;
            border-bottom: 1px solid var(--border-color);
            gap: 0.5rem;
        }
        
        .nav-menu.active .nav-link {
            padding: 0.75rem 1rem;
            border-radius: 0.5rem;
        }
        
        .nav-menu.active .nav-link:hover {
            background: var(--bg-tertiary);
        }
        
        .nav-toggle.active span:nth-child(1) {
            transform: rotate(45deg) translate(5px, 5px);
        }
        
        .nav-toggle.active span:nth-child(2) {
            opacity: 0;
        }
        
        .nav-toggle.active span:nth-child(3) {
            transform: rotate(-45deg) translate(7px, -6px);
        }
        
        body.menu-open {
            overflow: hidden;
        }
    `;
  document.head.appendChild(style);

  // Preload critical resources
  function preloadResources() {
    const criticalFonts = [
      'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
    ];

    criticalFonts.forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = href;
      document.head.appendChild(link);
    });
  }

  // Initialize preloading
  preloadResources();
})();
