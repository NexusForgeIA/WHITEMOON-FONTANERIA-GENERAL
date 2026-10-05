import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// fontaneria-notify — aviso por Telegram de un nuevo LEAD de la demo
// WhiteMoon · Caudal Fontanería (asistente guionizado de la web).
//
// El lead ya se inserta en leads_web desde el cliente
// (origen='demo-fontaneria-general'); esta función SOLO envía la notificación
// vía Telegram Bot API, manteniendo el token EXCLUSIVAMENTE server-side. En el
// JS de cliente no hay ningún token: solo la publishable key de Supabase, que
// únicamente puede INSERT en leads_web vía RLS.
//
// Recibe (POST):
//   { nombre, telefono, sector, interes, mensaje, urgente, origen }
// El cuerpo llega por navigator.sendBeacon como text/plain;charset=UTF-8 —
// un tipo CORS-safelisted, para no disparar un preflight que el beacon no
// sabe hacer. `req.json()` no mira el Content-Type, así que lo parsea igual.
//
// Secrets usados (nunca en cliente):
//   - TELEGRAM_BOT_TOKEN : token del bot de Telegram
//   - TELEGRAM_CHAT_ID   : chat destino del aviso
//
// Regla del proyecto: si el envío falla → console.warn, nunca interrumpe nada.
//
// Desplegar con:
//   supabase functions deploy fontaneria-notify --no-verify-jwt --project-ref mlaqtniujnvfxcvcourm

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Los campos vienen de un formulario público: se recortan para que nadie
// pueda mandar un mensaje kilométrico al chat de avisos.
const campo = (v: unknown, max: number) =>
  String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ ok: false, error: "método no permitido" }, 405);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const data = (payload.args ?? payload) as Record<string, unknown>;
  const nombre = campo(data.nombre, 80);
  const telefono = campo(data.telefono, 24);
  const sector = campo(data.sector, 40) || "fontaneria";
  const interes = campo(data.interes, 80);
  const mensaje = campo(data.mensaje, 400);
  const origen = campo(data.origen, 60) || "demo-fontaneria-general";
  const urgente = data.urgente === true;

  // Guard de lead incompleto — estándar WhiteMoon.
  // Un lead solo es válido con nombre Y teléfono: sin ambos no se avisa.
  if (!nombre || !telefono) {
    return json({ ok: false, error: "lead incompleto" }, 400);
  }

  const digitos = telefono.replace(/\D/g, "").replace(/^(?:0034|34)(?=[6-9]\d{8}$)/, "");

  const message =
    `🔧 NUEVO LEAD — ${origen}\n\n` +
    (urgente ? "🚨 El visitante habló de una urgencia\n\n" : "") +
    `👤 ${nombre}\n` +
    `📱 ${telefono}\n` +
    `🏷️ Sector: ${sector}\n` +
    `🛠️ Servicio: ${interes || "-"}\n` +
    (mensaje ? `💬 ${mensaje}\n` : "") +
    `\n` +
    `⚠️ Solo tenemos el lead: hay que llamar para ver la avería.\n` +
    `📲 CONTACTAR: https://wa.me/34${digitos}`;

  let notified = false;
  try {
    const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const tgChat = Deno.env.get("TELEGRAM_CHAT_ID");
    if (tgToken && tgChat) {
      const r = await fetch(
        `https://api.telegram.org/bot${tgToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgChat, text: message }),
        },
      );
      notified = r.ok;
      if (!r.ok) {
        console.warn("[fontaneria-notify] Telegram falló:", r.status, await r.text());
      }
    } else {
      console.warn("[fontaneria-notify] faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");
    }
  } catch (e) {
    console.warn("[fontaneria-notify] error enviando Telegram:", e);
  }

  return json({ ok: true, notified });
});
