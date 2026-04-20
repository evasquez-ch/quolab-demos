#!/usr/bin/env node
/**
 * QUOLAB TEMPLATE ASSEMBLER v3
 * - Imagenes automaticas via Unsplash
 * - 5 variantes tipograficas (fuente_variante: "1"-"5")
 * - Footer de creditos fijo en todas las paginas
 *
 * Uso:
 *   node assembler.js --input ejemplo-prospecto.json --output output/index.html
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const args  = process.argv.slice(2);

// ── API KEY UNSPLASH ────────────────────────────────────────
const UNSPLASH_KEY = 'dOhGLIOo-_r5UhFOx-r-0f6w-F4rtVUUsKzPUaCLxmA';

// ── FUENTES TIPOGRAFICAS (5 variantes) ──────────────────────
const FONT_VARIANTS = {
  '1': {
    name: 'Plus Jakarta Sans + Inter',
    url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600&display=swap',
    display: "'Plus Jakarta Sans', sans-serif",
    body: "'Inter', sans-serif"
  },
  '2': {
    name: 'Fraunces + Manrope',
    url: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800;9..144,900&family=Manrope:wght@400;500;600;700&display=swap',
    display: "'Fraunces', serif",
    body: "'Manrope', sans-serif"
  },
  '3': {
    name: 'Playfair Display + Source Sans 3',
    url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Source+Sans+3:wght@400;500;600&display=swap',
    display: "'Playfair Display', serif",
    body: "'Source Sans 3', sans-serif"
  },
  '4': {
    name: 'Bricolage Grotesque + DM Sans',
    url: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=DM+Sans:wght@400;500;600&display=swap',
    display: "'Bricolage Grotesque', sans-serif",
    body: "'DM Sans', sans-serif"
  },
  '5': {
    name: 'Syne + DM Sans',
    url: 'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap',
    display: "'Syne', sans-serif",
    body: "'DM Sans', sans-serif"
  }
};

// ── RUBRO → KEYWORDS UNSPLASH ───────────────────────────────
const RUBRO_KEYWORDS = {
  'veterinaria':     'veterinary pets animals clinic',
  'restaurant':      'restaurant food dining interior',
  'restaurante':     'restaurant food dining interior',
  'taller mecanico': 'auto mechanic car repair workshop',
  'mecanico':        'auto mechanic car repair workshop',
  'gasfiter':        'plumber plumbing pipe repair home',
  'gasfiteria':      'plumber plumbing pipe repair home',
  'peluqueria':      'hair salon beauty interior',
  'barberia':        'barber shop grooming interior',
  'dentista':        'dental clinic modern interior',
  'odontologia':     'dental clinic modern interior',
  'gimnasio':        'gym fitness workout modern',
  'farmacia':        'pharmacy medicine clean interior',
  'optica':          'eyewear optician store glasses',
  'panaderia':       'bakery bread pastry warm',
  'cafeteria':       'coffee cafe cozy interior',
  'cafe':            'coffee cafe cozy interior',
  'hotel':           'hotel lobby luxury interior',
  'spa':             'spa wellness relaxation calm',
  'yoga':            'yoga studio wellness meditation',
  'psicologia':      'therapy counseling calm office',
  'contabilidad':    'accounting office business professional',
  'abogado':         'law office professional modern',
  'marketing':       'marketing agency creative office',
  'tecnologia':      'technology digital innovation',
  'diseno':          'design studio creative workspace',
  'educacion':       'education modern classroom learning',
  'construccion':    'construction architecture modern building',
  'inmobiliaria':    'real estate modern house property',
  'limpieza':        'cleaning professional service home',
  'jardineria':      'garden landscape plants outdoor',
  'transporte':      'transport logistics delivery fleet',
  'default':         'professional business modern office'
};

// ── PARSEAR ARGUMENTOS ──────────────────────────────────────
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const inputFile  = getArg('--input');
const outputFile = getArg('--output');
const blocksDir  = path.join(__dirname, 'bloques');

if (!inputFile) { console.error('Error: se requiere --input <archivo.json>'); process.exit(1); }

// ── CARGAR VARIABLES ────────────────────────────────────────
const vars = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const bloques   = ['hero', 'servicios', 'testimonios', 'nosotros', 'cta', 'contacto'];
const variantes = ['A', 'B', 'C'];
const rand = () => variantes[Math.floor(Math.random() * variantes.length)];
bloques.forEach(b => { if (!vars[`${b}_variante`]) vars[`${b}_variante`] = rand(); });
vars.telefono_limpio = (vars.telefono || '').replace(/\D/g, '');

// ── UNSPLASH FETCH ──────────────────────────────────────────
function fetchUnsplash(rubro, count = 8) {
  return new Promise((resolve) => {
    const color = (vars.color_primario || '#1A56DB').replace('#', '');
    const ph = (txt) => ({
      url: `https://placehold.co/1200x800/${color}/ffffff?text=${encodeURIComponent(txt)}`,
      thumb: `https://placehold.co/600x400/${color}/ffffff?text=${encodeURIComponent(txt)}`,
      alt: txt, credit: null
    });

    if (UNSPLASH_KEY === 'TU_UNSPLASH_ACCESS_KEY') {
      console.log('  ⚠  Sin API key — placeholders');
      resolve(Array.from({ length: count }, () => ph(rubro || 'Negocio')));
      return;
    }

    const rubroKey = (rubro || '').toLowerCase();
    const kw = vars.unsplash_keywords || RUBRO_KEYWORDS[rubroKey] || rubro || RUBRO_KEYWORDS['default'];
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(kw)}&count=${count}&orientation=landscape&client_id=${UNSPLASH_KEY}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!Array.isArray(json) || json.length === 0) {
            resolve(Array.from({ length: count }, () => ph(rubro)));
            return;
          }
          console.log(`  📸 ${json.length} imagenes Unsplash — "${kw.split(' ')[0]}"`);
          resolve(json.map(p => ({
            url: p.urls.regular, thumb: p.urls.small, full: p.urls.full,
            alt: p.alt_description || rubro || 'imagen',
            credit: p.user.name,
            credit_url: `${p.user.links.html}?utm_source=quolab&utm_medium=referral`
          })));
        } catch { resolve(Array.from({ length: count }, () => ph(rubro))); }
      });
    }).on('error', () => resolve(Array.from({ length: count }, () => ph(rubro))));
  });
}

// ── LEER BLOQUE ─────────────────────────────────────────────
function readBloque(nombre, variante) {
  const file = path.join(blocksDir, nombre, `${nombre}-${variante}.html`);
  if (!fs.existsSync(file)) {
    const fallback = path.join(blocksDir, nombre, `${nombre}-A.html`);
    return fs.existsSync(fallback) ? fs.readFileSync(fallback, 'utf8') : '';
  }
  return fs.readFileSync(file, 'utf8');
}

function reemplazar(html, v) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => v[key] !== undefined ? v[key] : '');
}

const baseCss = fs.readFileSync(path.join(__dirname, 'assets', 'base.css'), 'utf8');

// ── MAIN ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔧 Generando demo: ${vars.nombre_negocio}`);
  console.log('  🌐 Buscando imagenes en Unsplash...');

  const imgs = await fetchUnsplash(vars.rubro, 8);
  const img  = (i) => imgs[i] || imgs[0];

  // Inyectar imagenes como variables
  vars.img_hero_url        = img(0).url;
  vars.img_hero_alt        = img(0).alt;
  vars.img_nosotros_url    = img(1).url;
  vars.img_nosotros_alt    = img(1).alt;
  vars.img_servicios_1_url = img(2).thumb;
  vars.img_servicios_2_url = img(3).thumb;
  vars.img_servicios_3_url = img(4).thumb;
  vars.img_extra_url       = img(5).url;
  vars.img_cta_url         = img(6).url;
  vars.img_contacto_url    = img(7) ? img(7).url : img(0).url;

  // Creditos Unsplash
  const autores = imgs.filter(i => i.credit).slice(0, 3);
  const creditsHtml = autores.length > 0
    ? `<div class="unsplash-credits">Fotografias: ${autores.map(i =>
        `<a href="${i.credit_url}" target="_blank">${i.credit}</a>`).join(', ')
      } via <a href="https://unsplash.com?utm_source=quolab&utm_medium=referral" target="_blank">Unsplash</a></div>`
    : '';

  // Fuente tipografica
  const fontKey = vars.fuente_variante || String(Math.floor(Math.random() * 5) + 1);
  const font    = FONT_VARIANTS[fontKey] || FONT_VARIANTS['1'];
  console.log(`  🔤 Tipografia: ${font.name} (variante ${fontKey})`);

  // Ensamblar bloques
  const seccionesHTML = bloques.map(b => {
    const raw = readBloque(b, vars[`${b}_variante`]);
    return reemplazar(raw, vars);
  }).join('\n\n');

  const ogImage = vars.og_image_url || vars.img_hero_url;
  const demoUrl = vars.demo_url || '';
  const year    = new Date().getFullYear();

  // Footer fijo
  const footerHtml = `
<footer class="ql-footer">
  <div class="ql-footer__inner">
    <span>&copy; ${year} <strong>${vars.nombre_negocio}</strong> &mdash; Todos los derechos reservados</span>
    <span>Desarrollado por <a href="https://quolab.cl" target="_blank" rel="noopener">Quolab</a> &middot; Dise&ntilde;o <a href="https://quolab.cl" target="_blank" rel="noopener">Enrique V&aacute;squez</a></span>
  </div>
</footer>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${vars.nombre_negocio} &mdash; ${vars.rubro} en ${vars.ciudad}</title>
  <meta name="description" content="${vars.slogan || vars.descripcion || ''}">
  <meta property="og:type"         content="website">
  <meta property="og:url"          content="${demoUrl}">
  <meta property="og:title"        content="${vars.nombre_negocio} &mdash; ${vars.slogan || vars.rubro}">
  <meta property="og:description"  content="${vars.descripcion || vars.slogan || ''}">
  <meta property="og:image"        content="${ogImage}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale"       content="es_CL">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:image"       content="${ogImage}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${font.url}" rel="stylesheet">
  <style>
    :root {
      --color-primario:   ${vars.color_primario   || '#1A56DB'};
      --color-secundario: ${vars.color_secundario || '#0E3A9E'};
      --color-acento:     ${vars.color_acento     || '#F97316'};
      --font-display: ${font.display};
      --font-body:    ${font.body};
    }
  </style>
  <style>${baseCss}</style>
</head>
<body>

${seccionesHTML}

${footerHtml}

${creditsHtml}

<a href="https://wa.me/${vars.telefono_limpio}?text=Hola%2C%20vi%20su%20pagina%20y%20me%20interesa%20saber%20mas"
   class="wa-float" target="_blank" aria-label="WhatsApp">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
</a>

<style>
.wa-float {
  position: fixed; bottom: 1.75rem; right: 1.75rem; z-index: 999;
  background: #25D366; color: #fff; width: 58px; height: 58px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 20px rgba(37,211,102,0.45); transition: transform 0.2s, box-shadow 0.2s;
}
.wa-float:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(37,211,102,0.55); }
.ql-footer {
  background: #080c14; border-top: 1px solid rgba(255,255,255,0.07); padding: 1rem 2rem;
}
.ql-footer__inner {
  max-width: 1160px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;
  font-size: 0.7rem; color: rgba(255,255,255,0.28); font-family: var(--font-body);
}
.ql-footer__inner strong { color: rgba(255,255,255,0.45); }
.ql-footer__inner a { color: rgba(255,255,255,0.38); text-decoration: underline; }
.ql-footer__inner a:hover { color: rgba(255,255,255,0.65); }
.unsplash-credits {
  text-align: center; padding: 0.45rem 1rem;
  font-size: 0.67rem; color: #bbb; background: #f0f0f0; border-top: 1px solid #e5e5e5;
}
.unsplash-credits a { color: #999; text-decoration: underline; }
@media(max-width:600px) { .ql-footer__inner { flex-direction:column; text-align:center; } }
</style>

</body>
</html>`;

  if (outputFile) {
    const outDir = path.dirname(outputFile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outputFile, html, 'utf8');
    console.log(`\n  ✅ Demo generada: ${outputFile}`);
    console.log(`     Negocio:   ${vars.nombre_negocio}`);
    console.log(`     Variantes: Hero-${vars.hero_variante} | Servicios-${vars.servicios_variante} | Nosotros-${vars.nosotros_variante} | CTA-${vars.cta_variante}`);
    console.log(`     Tipografia: ${font.name}\n`);
  } else {
    process.stdout.write(html);
  }
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
