/* =========================================================================
   Asistente IA de Caudal · Fontanería (demo WhiteMoon)

   Es un asistente GUIONIZADO: no hay ningún modelo de lenguaje detrás ni
   ninguna llamada a una API de IA. Sigue un flujo fijo:

       servicio -> nombre -> teléfono -> cierre

   Con nombre y teléfono el lead se envía en el acto, y `pagehide` lo cubre
   si el visitante cierra la pestaña justo en ese momento.

   Reglas de respuesta:
     - Máximo 3 frases por mensaje y UNA pregunta cada vez.
     - Nunca da precios ni plazos, ni afirma disponibilidad de 24 horas.
     - Gas: solo dice que se llame al 112 y al teléfono de la empresa. Ni un
       paso técnico: no es sitio para improvisar instrucciones de riesgo.
     - Fuga fuerte: remite al teléfono.

   Envío del lead (las dos cosas salen EN PARALELO; si una falla, la otra ni
   se entera):
     1) INSERT en leads_web con la clave PUBLICABLE (solo INSERT vía RLS).
     2) Aviso a la Edge Function `fontaneria-notify`, que es quien habla con
        Telegram. Va por navigator.sendBeacon con fallback a fetch keepalive.

   Ningún token ni secreto vive en este fichero: la clave publicable es
   pública por diseño y los tokens de Telegram están en los Secrets de la
   función.
   ========================================================================= */
(() => {
  "use strict";

  const SUPABASE_URL = "https://mlaqtniujnvfxcvcourm.supabase.co";
  const SUPABASE_KEY = "sb_publishable_6no6BuOgiA_2nonTJntAuQ_DTqEgrcV";
  const NOTIFY_FN = SUPABASE_URL + "/functions/v1/fontaneria-notify";
  const LEADS_URL = SUPABASE_URL + "/rest/v1/leads_web";
  const ORIGEN = "demo-fontaneria-general";
  const SECTOR = "fontaneria";
  const EMPRESA = "WhiteMoon";

  /* Nombre y teléfono de la demo salen de config.js, la única constante. */
  const DEMO = window.DEMO || {};
  const NEGOCIO = (DEMO.nombre || "Caudal") + " " + (DEMO.actividad || "Fontanería");
  const TELEFONO = DEMO.telefono || "643 199 580";

  /* Los `label` son EXACTAMENTE los data-servicio de los botones "Consultar"
     de las tarjetas, para que al entrar desde una tarjeta se salte la
     pregunta inicial. `pistas` reconoce el servicio en texto libre (ya sin
     tildes y en minúsculas). */
  const SERVICIOS = [
    { label: "Fugas de agua", pistas: /fuga|gote|humedad|pierde agua|mancha/ },
    { label: "Desatascos", pistas: /atasc|atranc|desag|no traga|bajante|arqueta/ },
    { label: "Calentadores y calderas", pistas: /calentador|caldera|termo|agua caliente/ },
    { label: "Calefacción", pistas: /radiador|calefacc|purg/ },
    { label: "Reformas de baño", pistas: /reforma|banera|plato de ducha|bano|sanitario/ },
    { label: "Urgencias", pistas: /urgen|emergencia/ },
  ];
  const OTRA = "Otra consulta";

  /* ---------- detector de texto libre ----------
     Se mira SIEMPRE antes de tratar el texto como respuesta del flujo, y en
     este orden: lo que puede ser peligroso va primero. */
  const sinTildes = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const ES_GAS = /huele a gas|olor a gas|oler a gas|fuga de gas|escape de gas|pierde gas|sale gas|butano|propano/;
  const ES_FUGA_FUERTE = /inunda|chorro|revent|no para de salir|sale mucha agua|mucha agua|fuga (muy )?(fuerte|grande|gorda|grave)|se (me )?esta (saliendo|inundando)|rotura/;
  const ES_PRECIO = /precio|cuanto (cuesta|vale|cobr|sale|costar|me cost)|tarifa|presupuesto|coste|euros|€|barato|caro|cobrais/;
  const ES_PLAZO = /cuanto tard|cuando (pod|ven|vais|vendr)|plazo|hoy mismo|esta (tarde|manana|noche)|ahora mismo|24 ?h|que dia/;

  const $ = (s, c = document) => c.querySelector(s);
  const panel = $("#asistente");
  if (!panel) return;
  const body = $(".asi-body", panel);
  const quick = $(".asi-quick", panel);
  const form = $(".asi-foot", panel);
  const input = $(".asi-foot input", panel);
  const sendBtn = $(".asi-foot button", panel);
  const cerrar = $(".asi-head__close", panel);
  const btn = $("#asistente-open");

  const nuevoLead = () => ({ servicio: "", nombre: "", telefono: "", detalle: "", urgente: false });
  let lead = nuevoLead();
  let step = "servicio";   // servicio -> nombre -> telefono -> fin
  let started = false;
  let enviado = false;     // el lead solo se manda una vez
  let disparador = null;   // quién abrió el panel, para devolverle el foco

  /* La pregunta pendiente de cada paso: se repite detrás de un aviso (precio,
     plazo…) para no dejar la conversación colgada. */
  const PREGUNTA = {
    servicio: "¿Qué necesitas?",
    nombre: "¿A nombre de quién lo dejo?",
    telefono: "¿A qué teléfono te llamamos?",
    fin: "",
  };

  /* ---------- helpers UI ---------- */
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scroll = () => { body.scrollTop = body.scrollHeight; };
  const addMsg = (text, who = "bot", extra) => {
    const el = document.createElement("div");
    el.className = "asi-msg " + who + (extra ? " " + extra : "");
    el.textContent = text;
    body.appendChild(el); scroll();
    return el;
  };
  const typing = () => {
    const t = document.createElement("div");
    t.className = "asi-typing";
    t.setAttribute("aria-hidden", "true");
    t.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(t); scroll();
    return t;
  };
  const botSay = (text, after, extra) =>
    new Promise((res) => {
      const t = typing();
      setTimeout(() => {
        t.remove(); addMsg(text, "bot", extra);
        if (after) after();
        res();
      }, reduced ? 0 : Math.min(900, 340 + text.length * 8));
    });
  const clearQuick = () => { quick.innerHTML = ""; };
  const setQuick = (items, onPick) => {
    clearQuick();
    items.forEach((label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => onPick(label));
      quick.appendChild(b);
    });
  };
  const setInput = (enabled, placeholder) => {
    input.disabled = !enabled; sendBtn.disabled = !enabled;
    input.placeholder = placeholder || "Escribe tu respuesta…";
    if (enabled && panel.classList.contains("open")) setTimeout(() => input.focus(), 60);
  };

  /* Aviso de resultado: el SVG es decorativo, quien informa es el texto. */
  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const tarjetaOk = (texto) => {
    const el = document.createElement("div");
    el.className = "asi-ok";
    const ic = document.createElement("span");
    ic.className = "asi-ok__ic";
    ic.setAttribute("aria-hidden", "true");
    ic.innerHTML = CHECK_SVG;
    const p = document.createElement("p");
    p.textContent = texto;
    el.append(ic, p);
    body.appendChild(el); scroll();
  };

  /* ---------- flujo ---------- */
  const start = async () => {
    if (started) return; started = true;
    setInput(false);
    await botSay("Hola, soy el asistente de IA de " + NEGOCIO + ". Tomo nota de tu avería y el equipo te llama.");
    if (step === "servicio") askServicio();
  };

  const askServicio = async () => {
    step = "servicio";
    await botSay(PREGUNTA.servicio, () => {
      if (step !== "servicio") return;
      setQuick(SERVICIOS.map((s) => s.label), (label) => { addMsg(label, "user"); pickServicio(label); });
      setInput(true, "O cuéntame qué pasa…");
    });
  };

  const pickServicio = async (label) => {
    lead.servicio = label;
    step = "nombre";
    clearQuick(); setInput(false);
    const texto = label === "Urgencias"
      ? "Si no puede esperar, lo más rápido es llamar al " + TELEFONO + ". Si prefieres que te llamemos, ¿a nombre de quién lo dejo?"
      : "Apuntado: " + label.toLowerCase() + ". " + PREGUNTA.nombre;
    if (label === "Urgencias") lead.urgente = true;
    await botSay(texto, () => setInput(true, "Tu nombre…"));
  };

  const askTelefono = async () => {
    step = "telefono";
    await botSay("Gracias, " + lead.nombre.split(" ")[0] + ". " + PREGUNTA.telefono, () => setInput(true, "Tu teléfono…"));
  };

  const cierre = async () => {
    step = "fin";
    setInput(false, "Conversación terminada"); clearQuick();
    const t = typing();
    const ok = await enviarLead();
    t.remove();
    if (ok) {
      tarjetaOk("Anotado. El equipo te llamará al " + lead.telefono + " para ver la avería.");
    } else {
      addMsg("No he podido guardar tus datos por un problema de conexión. Llámanos al " + TELEFONO + " y te atendemos.", "bot");
    }
  };

  /* ---------- avisos del detector ----------
     Devuelven true si el texto se ha atendido como aviso y NO debe tratarse
     como respuesta del flujo. */
  const conPregunta = (texto) => (PREGUNTA[step] ? texto + " " + PREGUNTA[step] : texto);

  const avisos = (v) => {
    const t = sinTildes(v);

    if (ES_GAS.test(t)) {
      /* Solo esto, y sin pregunta detrás: es lo único que tiene que leer. */
      lead.urgente = true;
      botSay("Si huele a gas, llama ahora al 112 y después a nuestro teléfono, el " + TELEFONO + ".", null, "alerta");
      return true;
    }

    if (ES_FUGA_FUERTE.test(t)) {
      lead.urgente = true;
      if (step === "servicio") {
        /* Ya sabemos qué es: se apunta el servicio y se pasa al nombre. */
        lead.servicio = "Fugas de agua";
        lead.detalle = v;
        step = "nombre";
        clearQuick(); setInput(false);
        botSay("Para una fuga fuerte, llámanos ahora al " + TELEFONO + ". Si no puedes llamar, ¿a nombre de quién dejo el aviso?",
          () => setInput(true, "Tu nombre…"), "alerta");
      } else {
        botSay(conPregunta("Para una fuga fuerte, llámanos ahora al " + TELEFONO + "."), null, "alerta");
      }
      return true;
    }

    if (ES_PRECIO.test(t)) {
      botSay(conPregunta("Eso se cierra tras ver la avería: desde aquí no doy precios."));
      return true;
    }

    if (ES_PLAZO.test(t)) {
      botSay(conPregunta("El plazo no te lo puedo dar desde aquí: te lo confirma el equipo cuando te llame."));
      return true;
    }

    return false;
  };

  /* ---------- entrada de texto ---------- */
  /* Guard: mínimo 9 dígitos reales (admite prefijo +34 / 0034 y separadores). */
  const isPhone = (v) => {
    const d = String(v).replace(/\D/g, "").replace(/^(?:0034|34)(?=[6-9]\d{8})/, "");
    return /^[6-9]\d{8}$/.test(d);
  };

  const handleText = (raw) => {
    const v = raw.trim().slice(0, 300);
    if (!v || step === "fin") return;
    addMsg(v, "user");
    input.value = "";

    /* Un teléfono válido en su paso es un teléfono, lleve lo que lleve. */
    if (!(step === "telefono" && isPhone(v)) && avisos(v)) return;

    if (step === "servicio") {
      const t = sinTildes(v);
      const s = SERVICIOS.find((x) => x.pistas.test(t));
      lead.detalle = v;
      pickServicio(s ? s.label : OTRA);
    } else if (step === "nombre") {
      if (v.length < 2 || /\d/.test(v)) { botSay("Necesito un nombre para dejar el aviso. " + PREGUNTA.nombre); return; }
      lead.nombre = v.slice(0, 80); setInput(false); askTelefono();
    } else if (step === "telefono") {
      if (!isPhone(v)) { botSay("Ese teléfono no parece válido. Escríbelo con 9 dígitos, por favor."); return; }
      lead.telefono = v; cierre();
    }
  };

  form.addEventListener("submit", (e) => { e.preventDefault(); handleText(input.value); });

  /* Con nombre y teléfono ya hay un lead válido. Si se cierra la pestaña
     antes de que `cierre` haya llegado a enviarlo, sale aquí. */
  window.addEventListener("pagehide", () => {
    if (!enviado && lead.nombre && lead.telefono) enviarLead();
  });

  /* ---------- envío del lead ---------- */

  /* INSERT en leads_web. Un único reintento ante 503 (el proyecto acaba de
     despertar): con uno solo el lead se salva sin arriesgar duplicados. */
  const insertaLead = (fila, reintentos) =>
    fetch(LEADS_URL, {
      method: "POST",
      keepalive: true,
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(fila),
    }).then((r) => {
      if (r.status === 503 && reintentos > 0) {
        return new Promise((ok) => setTimeout(ok, 800))
          .then(() => insertaLead(fila, reintentos - 1));
      }
      if (!r.ok) console.warn("[asistente] leads_web:", r.status);
      return r.ok;
    }).catch((e) => {
      console.warn("[asistente] leads_web sin red:", e);
      return false;
    });

  /* Aviso a la Edge Function. sendBeacon exige un tipo CORS-safelisted, así
     que el cuerpo viaja como Blob text/plain;charset=UTF-8 y NO como
     application/json (dispararía un preflight que el beacon no sabe hacer).
     Devuelve false si el navegador no lo encola; entonces se cae a fetch con
     keepalive para no perder el aviso. */
  const avisa = (cuerpo) => {
    const texto = JSON.stringify(cuerpo);
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([texto], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(NOTIFY_FN, blob)) return Promise.resolve(true);
      }
    } catch (e) {
      console.warn("[asistente] sendBeacon:", e);
    }
    return fetch(NOTIFY_FN, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: texto,
      keepalive: true,
    }).then((r) => {
      if (!r.ok) console.warn("[asistente] notify:", r.status);
      return r.ok;
    }).catch((e) => {
      console.warn("[asistente] notify sin red:", e);
      return false;
    });
  };

  async function enviarLead() {
    if (enviado) return true;
    enviado = true;

    const servicio = lead.servicio || OTRA;
    const mensaje = "Servicio: " + servicio +
      (lead.urgente ? " · URGENTE" : "") +
      (lead.detalle ? " · Dijo: " + lead.detalle : "");

    const insert = insertaLead({
      nombre: lead.nombre,
      telefono: lead.telefono,
      empresa: EMPRESA,
      sector: SECTOR,
      interes: servicio,
      mensaje: mensaje,
      origen: ORIGEN,
    }, 1);

    const notify = avisa({
      nombre: lead.nombre,
      telefono: lead.telefono,
      sector: SECTOR,
      interes: servicio,
      mensaje: lead.detalle,
      urgente: lead.urgente,
      origen: ORIGEN,
    });

    const [inserted] = await Promise.all([insert, notify]);
    return inserted;
  }

  /* ---------- abrir / cerrar ---------- */
  const open = (servicio, quien) => {
    disparador = quien || btn;
    panel.classList.add("open");
    /* Cerrado, el panel es invisible pero sus controles seguirían siendo
       enfocables con el teclado: inert los saca del recorrido. */
    panel.removeAttribute("inert");
    if (btn) btn.hidden = true;
    cerrar.focus();

    /* Se vuelve a abrir con una conversación ya cerrada: se ofrece otra. */
    if (started && step === "fin") {
      botSay("¿Te ayudo con otra avería?", () => {
        setQuick(["Sí, otra avería"], (label) => {
          addMsg(label, "user");
          lead = nuevoLead(); enviado = false;
          clearQuick();
          askServicio();
        });
      });
      return;
    }

    /* Desde una tarjeta: el servicio ya viene elegido. Se fija ANTES de
       saludar para que el saludo no llegue a preguntarlo. */
    const directo = servicio && step === "servicio" && SERVICIOS.some((s) => s.label === servicio);
    if (directo) step = "previo";
    const saludo = start();
    if (directo) {
      Promise.resolve(saludo).then(() => { addMsg(servicio, "user"); pickServicio(servicio); });
    } else if (!input.disabled) {
      setTimeout(() => input.focus(), 60);
    }
  };

  const close = () => {
    panel.classList.remove("open");
    panel.setAttribute("inert", "");
    if (btn) btn.hidden = false;
    const vuelve = disparador && disparador.isConnected && !disparador.hidden ? disparador : btn;
    if (vuelve) vuelve.focus();
  };

  btn && btn.addEventListener("click", () => open(null, btn));
  cerrar.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) close();
  });
  document.querySelectorAll("[data-asistente]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); open(el.dataset.servicio, el); })
  );
})();
