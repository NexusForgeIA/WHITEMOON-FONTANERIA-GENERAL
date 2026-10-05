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

  /* ---------- Scroll-spy del nav ----------
     Manda "la última sección rebasada". Las posiciones se miden la primera
     vez que hacen falta y se vuelven a medir si cambia el tamaño. */
  const spy = $$("#navLinks a");
  const zonas = spy.map((a) => $(a.getAttribute("href"))).filter(Boolean);
  if (spy.length && zonas.length) {
    let marcas = null;
    let ultima = null;
    let pendiente = false;
    const medir = () => {
      marcas = zonas.map((z) => ({ id: z.id, top: z.getBoundingClientRect().top + window.scrollY - 160 }));
    };
    const marcar = () => {
      pendiente = false;
      if (!marcas) medir();
      const y = window.scrollY;
      let actual = marcas[0].id;
      marcas.forEach((m) => { if (y >= m.top) actual = m.id; });
      /* Al fondo de la página manda la última, aunque sea corta. */
      if (y > 0 && window.innerHeight + y >= document.documentElement.scrollHeight - 2) actual = marcas[marcas.length - 1].id;
      if (actual === ultima) return;
      ultima = actual;
      spy.forEach((a) => {
        const on = a.getAttribute("href") === "#" + actual;
        a.classList.toggle("active", on);
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
    };
    const pedir = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(marcar);
    };
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", () => { marcas = null; pedir(); }, { passive: true });
    window.addEventListener("load", () => { marcas = null; if (window.scrollY > 0) pedir(); });
  }

  /* ---------- Reveal al hacer scroll ----------
     Nada se oculta de antemano. El observer avisa una primera vez con el
     estado de cada elemento: lo que está por debajo de la pantalla se marca
     .pre (oculto, a la espera) y se revela al entrar. Lo que ya se ve, o
     queda por encima, no se toca. */
  const reveals = $$(".reveal");
  if (reveals.length && "IntersectionObserver" in window && !reduced) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, n) => {
          const el = e.target;
          if (e.isIntersecting) {
            if (el.classList.contains("pre")) {
              el.style.transitionDelay = Math.min(n * 60, 240) + "ms";
              el.classList.add("in");
            }
            io.unobserve(el);
          } else if (e.boundingClientRect.top > 0) {
            el.classList.add("pre");
          } else {
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -5% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
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
