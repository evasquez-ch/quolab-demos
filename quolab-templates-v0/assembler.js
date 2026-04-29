#!/usr/bin/env node
/**
 * QUOLAB TEMPLATE ASSEMBLER v0
 *
 * Motor determinista que toma un JSON con datos del prospecto + contenido
 * generado por Claude (en N8N, antes de llamar al assembler) y produce un
 * HTML autocontenido listo para subir a Cloudflare Pages.
 *
 * Pipeline:
 *   1. Leer JSON del prospecto
 *   2. Determinar template segun rubro (cluster-mapping.json)
 *   3. Elegir paleta del pool del template (color-pools.json)
 *   4. Elegir tipografia del pool del template (font-pools.json)
 *   5. Aplicar fallbacks por cluster/rubro (data-fallbacks.json)
 *   6. Resolver imagenes deterministas via Unsplash /search/photos
 *   7. Calcular distribucion de estrellas a partir del rating real
 *   8. Cargar template HTML, inyectar shared (WhatsApp, franja Quolab, etc.)
 *   9. Reemplazar variables con motor robusto (incluye frases opcionales)
 *  10. Validar HTML final
 *
 * Uso:
 *   node assembler.js --input ejemplo.json --output output/index.html
 *
 * Flags opcionales (forzar variantes para testing):
 *   --template <id>   ej: 01-tecnico, 04-salud
 *   --color <hex|id>  ej: "#1E5BC6" o "Azul confianza"
 *   --font <id>       ej: jakarta-inter, fraunces-manrope
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { getIcon, hasIcon } = require('./icons/lucide-icons');

// ── CONFIG ──────────────────────────────────────────────────
const UNSPLASH_KEY     = 'dOhGLIOo-_r5UhFOx-r-0f6w-F4rtVUUsKzPUaCLxmA';
const TYPEKIT_QUOLAB   = 'https://use.typekit.net/rbc2plo.css';

const ROOT             = __dirname;
const CLUSTER_MAPPING  = require('./cluster-mapping.json');
const COLOR_POOLS      = require('./color-pools.json');
const FONT_POOLS       = require('./font-pools.json');
const COMUNAS          = require('./comunas-vecinas.json');
const FALLBACKS        = require('./data-fallbacks.json');
const ICON_MAPPING     = require('./icons/service-icon-mapping.json');

// ── CLI ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const inputFile     = getArg('--input');
const outputFile    = getArg('--output');
const forceTemplate = getArg('--template');
const forceColor    = getArg('--color');
const forceFont     = getArg('--font');
const offlineMode   = args.includes('--offline');

const isCli = require.main === module;

if (isCli && !inputFile) {
  console.error('Error: se requiere --input <archivo.json>');
  process.exit(1);
}

// ── HELPERS GENERICOS ───────────────────────────────────────
function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickFromPool(arr, hint, idKey = 'id') {
  if (hint) {
    const h = String(hint).toLowerCase();
    const found = arr.find(x =>
      (x[idKey] && String(x[idKey]).toLowerCase() === h) ||
      (x.hex   && String(x.hex).toLowerCase()   === h) ||
      (x.name  && String(x.name).toLowerCase()  === h)
    );
    if (found) return found;
  }
  return pickRandom(arr);
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── CLUSTER MATCHING ────────────────────────────────────────
function pickCluster(rubro) {
  const norm = normalize(rubro);
  if (!norm) return CLUSTER_MAPPING.default_template;

  let best = { id: null, len: 0 };
  for (const cluster of CLUSTER_MAPPING.clusters) {
    for (const kw of cluster.keywords) {
      const nkw = normalize(kw);
      if (nkw && norm.includes(nkw) && nkw.length > best.len) {
        best = { id: cluster.id, len: nkw.length };
      }
    }
  }
  return best.id || CLUSTER_MAPPING.default_template;
}

function pickRubroFallbacks(rubro) {
  const norm = normalize(rubro);
  let best = { fb: {}, len: 0 };
  for (const [kw, fb] of Object.entries(FALLBACKS.by_rubro)) {
    const nkw = normalize(kw);
    if (nkw && norm.includes(nkw) && nkw.length > best.len) {
      best = { fb, len: nkw.length };
    }
  }
  return best.fb;
}

function pickIconSlug(rubroOrTitle, override) {
  if (override && hasIcon(override)) return override;
  const norm = normalize(rubroOrTitle);
  let best = { slug: ICON_MAPPING._default, len: 0 };
  for (const [kw, slug] of Object.entries(ICON_MAPPING.by_rubro)) {
    const nkw = normalize(kw);
    if (nkw && norm.includes(nkw) && nkw.length > best.len) {
      best = { slug, len: nkw.length };
    }
  }
  return best.slug;
}

function getComunasVecinas(ciudad) {
  if (!ciudad) return null;
  const norm = normalize(ciudad);
  for (const [k, v] of Object.entries(COMUNAS.comunas)) {
    if (normalize(k) === norm) return v;
  }
  return null;
}

// ── ESTRELLAS ───────────────────────────────────────────────
function generarDistribucionEstrellas(rating, totalResenas) {
  const r = parseFloat(rating);
  if (!isFinite(r) || r <= 0) return null;

  let dist;
  if (r >= 4.7)      dist = { 5: 85, 4: 10, 3: 3,  2: 1,  1: 1  };
  else if (r >= 4.3) dist = { 5: 70, 4: 20, 3: 6,  2: 2,  1: 2  };
  else if (r >= 4.0) dist = { 5: 55, 4: 30, 3: 10, 2: 3,  1: 2  };
  else if (r >= 3.5) dist = { 5: 40, 4: 30, 3: 18, 2: 8,  1: 4  };
  else               dist = { 5: 25, 4: 25, 3: 25, 2: 15, 1: 10 };

  return {
    rating: r.toFixed(1),
    total: parseInt(totalResenas, 10) || 0,
    dist
  };
}

// ── UNSPLASH (deterministic via /search/photos) ─────────────
function fetchUnsplash(keyword, count = 10) {
  return new Promise((resolve) => {
    const kw = (keyword && keyword.trim()) || 'business modern professional';
    const url = `https://api.unsplash.com/search/photos`
              + `?query=${encodeURIComponent(kw)}`
              + `&per_page=${count}`
              + `&orientation=landscape`
              + `&content_filter=high`
              + `&client_id=${UNSPLASH_KEY}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.results || json.results.length === 0) {
            console.warn(`  Unsplash: 0 resultados para "${kw}"`);
            resolve([]);
            return;
          }
          resolve(json.results.map(p => ({
            url:    p.urls.regular,
            thumb:  p.urls.small,
            full:   p.urls.full,
            alt:    p.alt_description || p.description || kw,
            credit: p.user.name,
            credit_url: `${p.user.links.html}?utm_source=quolab&utm_medium=referral`
          })));
        } catch (err) {
          console.warn(`  Unsplash error: ${err.message}`);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.warn(`  Unsplash error: ${err.message}`);
      resolve([]);
    });
  });
}

// ── MOTOR DE REEMPLAZO ──────────────────────────────────────
/**
 * Reemplazo robusto. Soporta:
 *
 *   {{var}}                            -> reemplazo simple. Si no hay valor, deja "".
 *   {{? frase con {{var}} dentro ?}}   -> frase opcional. Si CUALQUIER var interna no
 *                                         tiene valor, se elimina la frase completa.
 *                                         Si todas tienen valor, se mantiene el texto
 *                                         (sin los marcadores ? ?).
 *
 * Limpieza adicional:
 *   - " ." -> "."   (espacios sueltos antes de puntuacion)
 *   - "()" "[]" vacios eliminados
 *   - multiples espacios o saltos colapsados
 */
function reemplazar(html, vars) {
  let out = html;

  // Aislar bloques <script>...</script> y <style>...</style> antes de aplicar
  // la limpieza, para que las reglas que sirven al texto visible (quitar
  // parens vacios, colapsar espacios, prepocisiones huerfanas) no destruyan
  // codigo JS o CSS valido (ej: `function ()` -> `function`, ` .clase` -> `.clase`).
  const protectedBlocks = [];
  out = out.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
    const placeholder = `\x00QL_PROTECT_${protectedBlocks.length}\x00`;
    protectedBlocks.push(match);
    return placeholder;
  });

  out = out.replace(/\{\{\?([\s\S]*?)\?\}\}/g, (_, inner) => {
    let allResolved = true;
    const filled = inner.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
      const val = vars[key];
      if (val === undefined || val === null || val === '') {
        allResolved = false;
        return '';
      }
      return String(val);
    });
    return allResolved ? filled : '';
  });

  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const val = vars[key];
    if (val === undefined || val === null || val === '') return '';
    return String(val);
  });

  out = out.replace(/[ \t]+([.,;:!?])/g, '$1');
  out = out.replace(/\(\s*\)/g, '');
  out = out.replace(/\[\s*\]/g, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/\n{3,}/g, '\n\n');

  const PREPS = '(en|de|a|al|del|con|sin|para|por|sobre|entre|hacia|hasta|desde)';
  const RE_PREP_BEFORE_PUNCT = new RegExp(`\\s+${PREPS}([.,;:!?])`, 'gi');
  const RE_PREP_BEFORE_CLOSE = new RegExp(`\\s+${PREPS}\\s*(<\\/[a-z][a-z0-9]*>)`, 'gi');
  const RE_PREP_END_LINE     = new RegExp(`\\s+${PREPS}\\s*$`, 'gim');
  out = out.replace(RE_PREP_BEFORE_PUNCT, '$2');
  out = out.replace(RE_PREP_BEFORE_CLOSE, '$2');
  out = out.replace(RE_PREP_END_LINE, '');

  // Restaurar bloques <script>/<style> intactos.
  out = out.replace(/\x00QL_PROTECT_(\d+)\x00/g, (_, idx) => protectedBlocks[Number(idx)]);

  return out;
}

// ── VALIDACION FINAL ────────────────────────────────────────
function validateHtml(html) {
  const issues = [];

  const leftover = html.match(/\{\{[\w?][\s\S]{0,80}?\}\}/g);
  if (leftover && leftover.length) {
    issues.push(`Variables sin reemplazar (${leftover.length}): ${leftover.slice(0, 3).join(' | ')}`);
  }

  const emptySrc = (html.match(/<img[^>]+src\s*=\s*(?:""|''|"undefined"|"null")/g) || []).length;
  if (emptySrc) issues.push(`${emptySrc} imagen(es) con src vacio o null`);

  const emptyHref = (html.match(/<a[^>]+href\s*=\s*(?:""|''|"undefined"|"null")/g) || []).length;
  if (emptyHref) issues.push(`${emptyHref} link(s) con href vacio o null`);

  const openTags  = (html.match(/<[a-zA-Z][^>]*>/g)  || []).length;
  const closeTags = (html.match(/<\/[a-zA-Z][^>]*>/g) || []).length;
  if (Math.abs(openTags - closeTags) > openTags * 0.4) {
    issues.push(`Posible HTML mal formado (open:${openTags} close:${closeTags})`);
  }

  return issues;
}

// ── BUILD VARS — agrega imagenes, fallbacks, estrellas, etc. al objeto vars ─
function buildVars(input, ctx) {
  const v = { ...input };

  v.telefono_limpio = (v.telefono || '').replace(/\D/g, '');
  v.anio = String(new Date().getFullYear());

  v.template_id  = ctx.templateId;
  v.color_signature = ctx.signature.hex;
  v.color_signature_name = ctx.signature.name;
  v.color_accent    = ctx.signature.accent || ctx.signature.hex;
  v.font_url        = ctx.fontPair.url;
  v.font_display    = ctx.fontPair.display;
  v.font_body       = ctx.fontPair.body;
  v.font_mono       = ctx.fontPair.mono || ctx.fontPair.body;

  const n = ctx.neutrals;
  v.color_bg         = n.bg;
  v.color_bg_alt     = n.bg_alt;
  v.color_text       = n.text;
  v.color_text_muted = n.text_muted;
  v.color_border     = n.border;
  v.color_surface    = n.surface || n.bg;
  v.color_text_on_signature = n.text_on_signature || '#FFFFFF';

  const imgs = ctx.imgs;
  const img  = (i) => imgs[i % imgs.length] || imgs[0] || { url: '', thumb: '', alt: '' };
  if (imgs.length > 0) {
    v.img_hero_url      = img(0).url;
    v.img_hero_alt      = img(0).alt;
    v.img_nosotros_url  = img(1).url;
    v.img_nosotros_alt  = img(1).alt;
    v.img_galeria_1_url = img(2).url;
    v.img_galeria_2_url = img(3).url;
    v.img_galeria_3_url = img(4).url;
    v.img_galeria_4_url = img(5).url;
    v.img_galeria_5_url = img(6).url;
    v.img_galeria_6_url = img(7).url;
    v.img_cta_url       = img(8 % imgs.length).url;
    v.img_extra_url     = img(9 % imgs.length).url;
  }
  v._unsplash_credits = imgs
    .filter(i => i.credit).slice(0, 3)
    .map(i => `<a href="${i.credit_url}" target="_blank" rel="noopener">${i.credit}</a>`)
    .join(', ');

  if (ctx.stars) {
    v.rating_value      = ctx.stars.rating;
    v.rating_total      = ctx.stars.total;
    v.rating_total_text = `${ctx.stars.total} resenas`;
    v.rating_pct_5      = ctx.stars.dist[5];
    v.rating_pct_4      = ctx.stars.dist[4];
    v.rating_pct_3      = ctx.stars.dist[3];
    v.rating_pct_2      = ctx.stars.dist[2];
    v.rating_pct_1      = ctx.stars.dist[1];
  }

  if (ctx.comunasVecinas) {
    v.comunas_lista = ctx.comunasVecinas.join(', ');
    ctx.comunasVecinas.forEach((c, idx) => { v[`comuna_${idx + 1}`] = c; });
  } else {
    v.comunas_lista = (ctx.clusterFb.comunas_default || COMUNAS._fallback);
  }

  const cb = ctx.clusterFb || {};
  if (cb.badges_hero && cb.badges_hero.length && !v.badge_hero) {
    v.badge_hero = pickRandom(cb.badges_hero);
  }
  if (cb.cta_principal && !v.cta_principal) v.cta_principal = cb.cta_principal;
  if (cb.cta_secundario && !v.cta_secundario) v.cta_secundario = cb.cta_secundario;
  if (cb.cta_fuerte_titulo && !v.cta_fuerte_titulo) v.cta_fuerte_titulo = cb.cta_fuerte_titulo;
  if (cb.cta_fuerte_subtitulo && !v.cta_fuerte_subtitulo) v.cta_fuerte_subtitulo = cb.cta_fuerte_subtitulo;
  if (cb.frase_aspiracional && !v.frase_aspiracional) v.frase_aspiracional = cb.frase_aspiracional;
  if (cb.horarios_default && !v.horarios) v.horarios = cb.horarios_default;
  if (cb.strip_confianza && !v._strip) v._strip = cb.strip_confianza;
  if (cb.proceso && !v._proceso) v._proceso = cb.proceso;

  const rb = ctx.rubroFb || {};
  if (rb.servicios_default && !v._servicios) v._servicios = rb.servicios_default;
  if (rb.platos_default    && !v._platos)    v._platos    = rb.platos_default;
  if (rb.categorias_default && !v._categorias) v._categorias = rb.categorias_default;
  if (rb.areas_default      && !v._areas)      v._areas      = rb.areas_default;

  return v;
}

// ── BLOQUES SHARED INYECTADOS EN MARCADORES ─────────────────
function buildSharedFragments(v) {
  const baseReset  = readFile('shared/base-reset.css');
  const waCss      = readFile('shared/whatsapp-float.css');
  const stripCss   = readFile('shared/quolab-strip.css');
  const animJs     = readFile('shared/anim-observer.js');
  const waHtml     = readFile('shared/whatsapp-float.html');
  const stripHtml  = readFile('shared/quolab-strip.html');

  const headFonts = [
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link rel="preconnect" href="https://use.typekit.net">`,
    `<link rel="stylesheet" href="${v.font_url}">`,
    `<link rel="stylesheet" href="${TYPEKIT_QUOLAB}">`
  ].join('\n  ');

  const headVars = `<style>
:root {
  --ql-bg:               ${v.color_bg};
  --ql-bg-alt:           ${v.color_bg_alt};
  --ql-surface:          ${v.color_surface};
  --ql-text:             ${v.color_text};
  --ql-text-muted:       ${v.color_text_muted};
  --ql-border:           ${v.color_border};
  --ql-signature:        ${v.color_signature};
  --ql-accent:           ${v.color_accent};
  --ql-text-on-signature:${v.color_text_on_signature};
  --ql-font-display:     ${v.font_display};
  --ql-font-body:        ${v.font_body};
  --ql-font-mono:        ${v.font_mono};
}
</style>`;

  return {
    head_fonts:      headFonts,
    head_base_reset: `<style>${baseReset}</style>`,
    head_vars:       headVars,
    head_wa_css:     `<style>${waCss}</style>`,
    head_strip_css:  `<style>${stripCss}</style>`,
    body_wa:         waHtml,
    body_strip:      stripHtml,
    body_anim_js:    `<script>${animJs}</script>`
  };
}

function injectShared(html, frags) {
  const map = {
    '<!--QL_HEAD_FONTS-->':      frags.head_fonts,
    '<!--QL_HEAD_BASE_RESET-->': frags.head_base_reset,
    '<!--QL_HEAD_VARS-->':       frags.head_vars,
    '<!--QL_HEAD_WA_CSS-->':     frags.head_wa_css,
    '<!--QL_HEAD_STRIP_CSS-->':  frags.head_strip_css,
    '<!--QL_BODY_WA-->':         frags.body_wa,
    '<!--QL_BODY_STRIP-->':      frags.body_strip,
    '<!--QL_BODY_ANIM_JS-->':    frags.body_anim_js
  };
  for (const [marker, content] of Object.entries(map)) {
    html = html.split(marker).join(content);
  }
  return html;
}

// ── RENDER DE BLOQUES DINAMICOS (servicios, platos, etc.) ────────────
/**
 * Genera el HTML de una lista de "cards" (servicios / platos / categorias / areas).
 * El template indica que renderice asi via marcador <!--QL_LIST:tipo-->.
 *
 * Tipos soportados:
 *   servicios   -> usa v._servicios o v.servicio_1_titulo / _desc / _icono ... v.servicio_6_*
 *   platos      -> usa v._platos
 *   categorias  -> usa v._categorias
 *   areas       -> usa v._areas
 *
 * Cada item tiene shape variable; el template define el wrapper y el loop estructural.
 * Para mantenerlo simple, este v0 expone los items como variables planas
 * (servicio_1_titulo, servicio_2_titulo, ...) y deja que el template los use.
 */
function flattenLists(v) {
  const flatten = (arr, prefix, fields) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((item, i) => {
      const idx = i + 1;
      for (const [src, dst] of Object.entries(fields)) {
        const key = `${prefix}_${idx}_${dst}`;
        if (v[key] === undefined || v[key] === '' || v[key] === null) {
          v[key] = item[src] !== undefined ? item[src] : '';
        }
      }
    });
  };

  flatten(v._servicios,  'servicio',  { titulo: 'titulo', desc: 'desc', icono: 'icono' });
  flatten(v._platos,     'plato',     { nombre: 'nombre', desc: 'desc', precio: 'precio' });
  flatten(v._categorias, 'categoria', { titulo: 'titulo', desc: 'desc' });
  flatten(v._areas,      'area',      { titulo: 'titulo', desc: 'desc' });
  flatten(v._strip,      'strip',     { value: 'value', label: 'label' });
  flatten(v._proceso,    'paso',      { titulo: 'titulo', desc: 'desc' });

  for (let i = 1; i <= 6; i++) {
    const slug = v[`servicio_${i}_icono`];
    if (slug) v[`servicio_${i}_icono_svg`] = getIcon(pickIconSlug(slug, slug), { size: 28 });
    const tit  = v[`servicio_${i}_titulo`];
    if (tit && !v[`servicio_${i}_icono_svg`]) {
      v[`servicio_${i}_icono_svg`] = getIcon(pickIconSlug(tit), { size: 28 });
    }
  }
  if (!v.servicio_principal_icono_svg && v.rubro) {
    v.servicio_principal_icono_svg = getIcon(pickIconSlug(v.rubro), { size: 32 });
  }

  for (let i = 1; i <= 3; i++) {
    const autor = v[`testimonio_${i}_autor`];
    if (autor && !v[`testimonio_${i}_inicial`]) {
      const ch = String(autor).trim().charAt(0).toUpperCase();
      if (ch) v[`testimonio_${i}_inicial`] = ch;
    }
  }
}

// ── MAIN ─────────────────────────────────────────────────────
async function main() {
  const inputAbs = path.isAbsolute(inputFile) ? inputFile : path.join(process.cwd(), inputFile);
  const input    = JSON.parse(fs.readFileSync(inputAbs, 'utf8'));

  console.log(`\n[Quolab Assembler v0]`);
  console.log(`  Negocio: ${input.nombre_negocio}`);
  console.log(`  Rubro:   ${input.rubro}`);
  console.log(`  Ciudad:  ${input.ciudad}`);

  const templateId = forceTemplate || pickCluster(input.rubro);
  console.log(`  Template -> ${templateId}`);

  const colors    = COLOR_POOLS[templateId];
  if (!colors) { console.error(`Error: no hay pool de colores para ${templateId}`); process.exit(1); }
  const signature = pickFromPool(colors.signature_pool, forceColor);
  console.log(`  Signature -> ${signature.hex} (${signature.name})`);

  const fonts    = FONT_POOLS[templateId];
  if (!fonts) { console.error(`Error: no hay pool de fuentes para ${templateId}`); process.exit(1); }
  const fontPair = pickFromPool(fonts, forceFont);
  console.log(`  Tipografia -> ${fontPair.id}`);

  const clusterFb = FALLBACKS.by_cluster[templateId] || {};
  const rubroFb   = pickRubroFallbacks(input.rubro);
  const comunas   = getComunasVecinas(input.ciudad);
  const stars     = generarDistribucionEstrellas(input.rating, input.total_resenas);

  const kw = input.unsplash_keywords || rubroFb.unsplash_keywords || normalize(input.rubro);
  let imgs;
  if (offlineMode) {
    console.log(`  Unsplash -> SKIP (modo offline, placeholders)`);
    const c = (signature.hex || '#1E5BC6').replace('#', '');
    imgs = Array.from({ length: 10 }, (_, i) => ({
      url:    `https://placehold.co/1600x900/${c}/ffffff?text=${encodeURIComponent(kw)}+${i + 1}`,
      thumb:  `https://placehold.co/600x600/${c}/ffffff?text=${encodeURIComponent(kw)}+${i + 1}`,
      full:   `https://placehold.co/2400x1600/${c}/ffffff?text=${encodeURIComponent(kw)}+${i + 1}`,
      alt:    `${kw} placeholder ${i + 1}`,
      credit: null,
      credit_url: null
    }));
  } else {
    console.log(`  Unsplash -> "${kw}"`);
    imgs = await fetchUnsplash(kw, 10);
    console.log(`  ${imgs.length} imagenes obtenidas`);
  }

  const ctx = {
    templateId,
    signature,
    fontPair,
    neutrals: colors.neutrals,
    clusterFb,
    rubroFb,
    comunasVecinas: comunas,
    imgs,
    stars
  };
  const vars = buildVars(input, ctx);
  flattenLists(vars);

  const templateDir  = path.join(ROOT, 'templates', templateId);
  const templateHtml = path.join(templateDir, 'index.html');
  const templateCss  = path.join(templateDir, 'style.css');

  if (!fs.existsSync(templateHtml)) {
    console.error(`\nError: el template ${templateId} aun no esta implementado.`);
    console.error(`  Falta el archivo: templates/${templateId}/index.html`);
    console.error(`  (Esto es esperable en Fase 1: el motor esta listo, los templates llegan en Fase 3+.)`);
    process.exit(2);
  }

  let html = fs.readFileSync(templateHtml, 'utf8');

  if (fs.existsSync(templateCss)) {
    const cssBlock = `<style>${fs.readFileSync(templateCss, 'utf8')}</style>`;
    html = html.replace('<!--QL_TEMPLATE_CSS-->', cssBlock);
  }

  const frags = buildSharedFragments(vars);
  html = injectShared(html, frags);
  html = reemplazar(html, vars);

  const issues = validateHtml(html);
  if (issues.length) {
    console.warn('\n  Validacion - warnings:');
    issues.forEach(i => console.warn('   - ' + i));
  } else {
    console.log('  Validacion -> OK');
  }

  if (outputFile) {
    const outAbs = path.isAbsolute(outputFile) ? outputFile : path.join(process.cwd(), outputFile);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, html, 'utf8');
    console.log(`\n  Demo -> ${outAbs}\n`);
  } else {
    process.stdout.write(html);
  }
}

if (isCli) {
  main().catch(err => {
    console.error('\nError:', err.stack || err.message);
    process.exit(1);
  });
}

module.exports = {
  pickCluster,
  pickRubroFallbacks,
  pickIconSlug,
  generarDistribucionEstrellas,
  reemplazar,
  validateHtml,
  normalize
};
