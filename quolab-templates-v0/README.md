# Quolab Templates v0

Sistema de generacion de demos web personalizadas para prospectos. Reemplaza al sistema anterior de bloques modulares (`quolab-templates-v3/`) por **10 templates HTML completos**, cada uno disenado para un cluster de rubros con personalidad visual propia.

> **Estado:** Fase 1 completa (motor + infraestructura).
> Los 10 templates se construyen uno por uno en Fases 3-4.

## Como funciona

```
JSON del prospecto
       |
       v
  [ assembler.js ]  <-- determinista, sin llamadas a Claude
       |
       v
  HTML autocontenido listo para Cloudflare Pages
```

El flujo N8N (`flujo_02_fabrica_web`) ya llama a Claude API antes de invocar al assembler para generar slogan, descripcion, servicios, testimonios y `unsplash_keywords`. El assembler solo ensambla — toma el JSON ya enriquecido y produce el HTML final.

### Pipeline interno

1. **Cluster matching** — `cluster-mapping.json` decide que template usar segun el rubro (`Gasfiter` -> `01-tecnico`, `Barberia` -> `02-belleza-oscuro`, etc.). Si no matchea ninguno, default es `10-profesional`.
2. **Paleta** — del `color-pools.json` del template se elige un color signature (random o forzado por flag).
3. **Tipografia** — del `font-pools.json` del template se elige un par tipografico.
4. **Fallbacks** — `data-fallbacks.json` rellena lo que el JSON no traiga (badges hero, strip de confianza, horarios genericos por subrubro, etc.).
5. **Imagenes** — Unsplash via `/search/photos` con keywords coherentes al rubro. URLs deterministas (no `/random`).
6. **Estrellas** — distribucion calculada a partir del rating real del prospecto (las 5 barras siempre presentes).
7. **Render** — se carga `templates/{id}/index.html`, se inyectan los shared (WhatsApp, franja Quolab, fonts, reset, anim observer) y se reemplazan las variables.
8. **Validacion** — chequeo final: ningun `{{...}}` sin reemplazar, ningun `src` o `href` vacio, HTML balanceado.

## Estructura

```
quolab-templates-v0/
├── assembler.js                    Motor principal (modulo + CLI)
├── test-motor.js                   Suite de validacion sin red
│
├── cluster-mapping.json            Rubro keyword -> template
├── color-pools.json                Pool de colores signature por template
├── font-pools.json                 Pool de pares tipograficos por template
├── comunas-vecinas.json            Comunas vecinas del Gran Santiago
├── data-fallbacks.json             Datos genericos por cluster y rubro
│
├── icons/
│   ├── lucide-icons.js             ~50 iconos SVG inline (MIT, Lucide)
│   └── service-icon-mapping.json   Rubro keyword -> nombre de icono
│
├── shared/                          Comun a los 10 templates
│   ├── base-reset.css              CSS reset + animaciones
│   ├── anim-observer.js            IntersectionObserver para .ql-anim
│   ├── whatsapp-float.html         Boton flotante
│   ├── whatsapp-float.css
│   ├── quolab-strip.html           Franja final con identidad Quolab
│   └── quolab-strip.css            Negro #0a0a0c + Neulis (Adobe Typekit)
│
├── templates/                       10 templates (uno por cluster)
│   ├── 01-tecnico/                 Servicios tecnicos
│   ├── 02-belleza-oscuro/          Belleza editorial oscuro
│   ├── 03-belleza-claro/           Belleza moderno claro
│   ├── 04-salud/                   Salud
│   ├── 05-gastro-oscuro/           Gastronomia premium oscuro
│   ├── 06-gastro-claro/            Gastronomia calido claro
│   ├── 07-street-food/             Street food moderno
│   ├── 08-retail-claro/            Retail moderno claro
│   ├── 09-retail-calido/           Retail amigable calido
│   └── 10-profesional/             Profesional / oficina (default)
│
├── ejemplos/                        Prospectos de prueba
│   └── dr-plumber.json
│
└── output/                          HTML generados (no commitear)
```

Cada folder de `templates/{id}/` debe contener:
- `index.html` — pagina completa con marcadores `<!--QL_*-->` (ver mas abajo).
- `style.css` — CSS especifico del template (se inyecta via `<!--QL_TEMPLATE_CSS-->`).

## Uso del CLI

```bash
node assembler.js --input ejemplos/dr-plumber.json --output output/dr-plumber.html
```

### Flags opcionales (forzar variantes para testing)

```bash
node assembler.js \
  --input ejemplos/dr-plumber.json \
  --output output/test.html \
  --template 01-tecnico \
  --color "#0066FF" \
  --font jakarta-inter
```

### Test del motor (sin red)

```bash
node test-motor.js
```

## Variables del prospecto

Variables minimas requeridas:

| Campo               | Tipo     | Ejemplo                    |
|---------------------|----------|----------------------------|
| `nombre_negocio`    | string   | "Dr Plumber Gasfiter"      |
| `rubro`             | string   | "Gasfiter"                 |
| `ciudad`            | string   | "Pedro Aguirre Cerda"      |
| `telefono`          | string   | "+56 9 8765 4321"          |

Variables opcionales (todas con fallback inteligente):

| Campo               | Notas                                                      |
|---------------------|------------------------------------------------------------|
| `direccion`         | Direccion completa del local                               |
| `rating`            | Numero (ej: 4.7) — genera distribucion de estrellas        |
| `total_resenas`     | Entero — total de resenas mostradas                        |
| `slogan`            | Generado por Claude API en N8N                             |
| `descripcion`       | Generado por Claude API en N8N                             |
| `badge_hero`        | Si falta, se usa uno del cluster                           |
| `unsplash_keywords` | Generado por Claude API en N8N. Si falta, deriva del rubro |
| `servicio_N_titulo` | Generado por Claude API. N va de 1 a 6                     |
| `servicio_N_desc`   | Idem                                                       |
| `servicio_N_icono`  | Slug Lucide (`wrench`, `scissors`, etc.) — no emojis       |
| `testimonio_N_*`    | autor, texto, rating — generados por Claude por prospecto  |

## Sintaxis del template HTML

### Variables simples

```
{{nombre_negocio}}
```

Si no tiene valor, queda `""` y se aplica limpieza automatica (quita conectores huerfanos como "en .").

### Frases opcionales

Cuando la frase entera depende de una variable que puede faltar, usar `{{? ... ?}}`:

```html
<p>Atendemos {{? en {{ciudad}} y comunas vecinas ?}}.</p>
```

Si `{{ciudad}}` no tiene valor, la frase entera (incluida la palabra "en") se elimina y queda `<p>Atendemos.</p>`.

Si tiene valor, queda `<p>Atendemos en Santiago y comunas vecinas.</p>`.

### Marcadores de inyeccion (shared)

El template debe incluir estos marcadores donde corresponda. El assembler los reemplaza por el contenido shared:

| Marcador                       | Que inyecta                                                 |
|--------------------------------|-------------------------------------------------------------|
| `<!--QL_HEAD_FONTS-->`         | preconnect + link a Google Fonts del par + Typekit Quolab  |
| `<!--QL_HEAD_BASE_RESET-->`    | `<style>` con base-reset.css                               |
| `<!--QL_HEAD_VARS-->`          | `<style>` con las CSS variables (`--ql-bg`, `--ql-signature`, ...) |
| `<!--QL_HEAD_WA_CSS-->`        | `<style>` con CSS del boton WhatsApp                       |
| `<!--QL_HEAD_STRIP_CSS-->`     | `<style>` con CSS de la franja Quolab                      |
| `<!--QL_TEMPLATE_CSS-->`       | `<style>` con `style.css` del template                     |
| `<!--QL_BODY_WA-->`            | HTML del boton flotante (con `{{telefono_limpio}}` ya resuelto) |
| `<!--QL_BODY_STRIP-->`         | HTML de la franja final Quolab (con `{{anio}}` y `{{nombre_negocio}}`) |
| `<!--QL_BODY_ANIM_JS-->`       | `<script>` del observer de animaciones                     |

### CSS variables disponibles (set por el assembler)

```
--ql-bg, --ql-bg-alt, --ql-surface
--ql-text, --ql-text-muted, --ql-border
--ql-signature, --ql-accent, --ql-text-on-signature
--ql-font-display, --ql-font-body, --ql-font-mono
```

### Animaciones

```html
<div class="ql-anim">...</div>          <!-- fade-in al entrar al viewport -->
<ul class="ql-stagger">...</ul>          <!-- hijos en cascada -->
<header class="ql-hero-stagger">...</header>  <!-- hero anim B al cargar -->
```

## Como agregar un cluster nuevo

1. Crear `templates/{nn-id}/index.html` y `style.css`.
2. Agregar entrada en `cluster-mapping.json` con sus keywords.
3. Agregar entrada en `color-pools.json` con neutrals + signature pool.
4. Agregar entrada en `font-pools.json` con al menos 2 pares.
5. Agregar entrada en `data-fallbacks.json > by_cluster` con datos genericos.
6. Si el cluster usa rubros nuevos, agregarlos en `service-icon-mapping.json`.

## Como agregar un rubro al mapping existente

1. Agregar la keyword en el cluster correspondiente en `cluster-mapping.json`.
2. Si tiene servicios/platos/categorias especificos, agregar entrada en `data-fallbacks.json > by_rubro`.
3. Si el icono por defecto del cluster no calza, agregar mapping especifico en `service-icon-mapping.json`.

## Sincronizacion con N8N

El nodo "Ensamblar HTML (Fabrica Web)" de `flujo_02_fabrica_web_FIX_v3.json` contiene una copia del motor de ensamblado. **Cualquier cambio relevante a `assembler.js` debe replicarse alli**, o N8N debe pasar a invocar este script remotamente.

Plan v0: el `assembler.js` local es la fuente de verdad. Cuando se cierre la Fase 5 (integracion N8N), se actualiza el nodo Code para que descargue y ejecute el assembler desde `raw.githubusercontent.com`.

## Convenciones del codigo

- Sin emojis en el HTML final visible al usuario. Solo iconos SVG inline (Lucide).
- Tipografia de cada template via Google Fonts. Identidad Quolab via Adobe Typekit (solo en franja final).
- HTML autocontenido: todo el CSS y JS inline. Las unicas dependencias externas son Google Fonts, Typekit y las imagenes Unsplash.
- Animaciones: solo `transform` y `opacity`. Respetan `prefers-reduced-motion`.
- Responsive: desktop 1280px+ y mobile 375px+. Tablet 768px recomendado.
- Accesibilidad: contraste WCAG AA, labels en inputs, alt text en imagenes.
