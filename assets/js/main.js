/* =========================================================================
   Caudal · Fontanería — interacciones
   Sin librerías externas. Respeta prefers-reduced-motion.
   ========================================================================= */
(() => {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ---------- Datos de la demo (config.js) ----------
     data-demo="nombre|telefono|email" pinta el texto;
     data-demo-href="tel|wa|mailto" pinta el enlace. Siempre con textContent
     y setAttribute, nunca con innerHTML. */
  const demo = window.DEMO;
  if (demo) {
    const wa = demo.telefonoE164.replace(/\D/g, "");
    const href = {
      tel: "tel:" + demo.telefonoE164,
      wa: "https://wa.me/" + wa,
      mailto: "mailto:" + demo.email,
    };
    $$("[data-demo]").forEach((el) => {
      const v = demo[el.dataset.demo];
      if (v) el.textContent = v;
    });
    $$("[data-demo-href]").forEach((el) => {
      const v = href[el.dataset.demoHref];
      if (v) el.setAttribute("href", v);
    });
  }

  /* ---------- Nav: sombra al bajar ----------
     Un solo listener, agrupado en rAF: se lee scrollY una vez por frame. */
  const nav = $("#nav");
  if (nav) {
    let ticking = false;
    const sync = () => {
      nav.classList.toggle("scrolled", window.scrollY > 20);
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(sync);
      },
      { passive: true }
    );
    /* Por si se llega con el scroll ya movido (vuelta atrás, enlace profundo). */
    requestAnimationFrame(sync);
  }

  /* ---------- Menú móvil ----------
     Cerrado es invisible, pero sus enlaces seguirían siendo enfocables con
     el teclado: `inert` los saca del recorrido de tabulación. */
  const burger = $("#burger");
  const menu = $("#mobileMenu");
  if (burger && menu) {
    const setMenu = (open) => {
      menu.classList.toggle("open", open);
      menu.toggleAttribute("inert", !open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      document.body.style.overflow = open ? "hidden" : "";
    };
    burger.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
    $$("a", menu).forEach((el) => el.addEventListener("click", () => setMenu(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("open")) {
        setMenu(false);
        burger.focus();
      }
    });
    /* Si se abre en móvil y se gira o se ensancha la ventana, el menú ya no
       tiene botón para cerrarse: se cierra solo. */
    window.matchMedia("(min-width: 901px)").addEventListener("change", (e) => {
      if (e.matches) setMenu(false);
    });
  }

  /* ---------- Palabra rotativa del hero ---------- */
  const rot = $("#rotWord");
  if (rot && !reduced) {
    const words = [
      "fugas de agua",
      "desatascos",
      "calentadores y calderas",
      "calefacción",
      "reformas de baño",
      "urgencias",
    ];
    let i = 0;
    setInterval(() => {
      rot.classList.add("out");
      setTimeout(() => {
        i = (i + 1) % words.length;
        rot.textContent = words[i];
        rot.classList.remove("out");
      }, 420);
    }, 2600);
  }

  /* ---------- Año del footer ---------- */
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Guardia anti-overflow horizontal ----------
     Solo en local: es una ayuda de desarrollo, no algo que deba pagar el
     visitante. */
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    window.addEventListener("load", () => {
      setTimeout(() => {
        const de = document.documentElement;
        if (de.scrollWidth > de.clientWidth) {
          console.warn("[layout] overflow horizontal:", de.scrollWidth, ">", de.clientWidth);
        }
      }, 300);
    });
  }
})();
