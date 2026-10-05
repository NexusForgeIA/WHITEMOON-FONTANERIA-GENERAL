# WHITEMOON-FONTANERIA-GENERAL

Demo comercial de WhiteMoon Agencia IA para el sector fontanería: «Caudal · Fontanería», un negocio ficticio.

Web: https://nexusforgeia.github.io/WHITEMOON-FONTANERIA-GENERAL/

## Qué hay

- `index.html`, `assets/css/style.css`, `assets/js/` — HTML, CSS y JS puros, sin frameworks ni dependencias.
- `assets/js/config.js` — nombre y teléfono de la demo en una sola constante.
- `assets/js/asistente.js` — asistente guionizado (sin LLM): servicio → nombre → teléfono → cierre.
- `supabase/functions/fontaneria-notify/` — fuente de la Edge Function que avisa por Telegram.
- `scripts/verifica-contraste.py` — mide el contraste AA de la paleta y del hero.
- `llms.txt`, `robots.txt`, `sitemap.xml` — SEO / GEO.

## Probar en local

```
python -m http.server 8765
python scripts/verifica-contraste.py
```

## Lead

Con nombre y teléfono, el asistente hace dos cosas en paralelo:

1. `INSERT` en `leads_web` con la clave publicable de Supabase (`sector='fontaneria'`, `origen='demo-fontaneria-general'`).
2. Aviso a `fontaneria-notify` con `navigator.sendBeacon` (fallback `fetch keepalive`).

Los tokens de Telegram viven en los Secrets de la función, nunca en el cliente.

## Reglas de contenido

Sin precios, cifras de rendimiento, garantías, «24h», testimonios ni certificaciones. Los datos de contacto son de ejemplo y van marcados como DEMO. Si se cambia una pregunta de la sección de preguntas frecuentes, hay que cambiarla igual en el JSON-LD `FAQPage` de `index.html`.
