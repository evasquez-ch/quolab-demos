#!/usr/bin/env node
/**
 * QUOLAB v0 — Test del motor del assembler.
 *
 * Ejercita las funciones puras del assembler (sin llamar a Unsplash ni a disco):
 *   - normalize, pickCluster, pickRubroFallbacks, pickIconSlug
 *   - reemplazo de variables (incluye frases opcionales)
 *   - distribucion de estrellas
 *   - validacion de HTML final
 *
 * Uso:
 *   node test-motor.js
 *
 * No requiere conexion a internet. Util para validar cambios al motor
 * antes de generar las demos completas en Fase 3+.
 */

'use strict';

const m = require('./assembler.js');

let passed = 0, failed = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  OK  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       actual:   ${JSON.stringify(actual)}`);
  }
}

console.log('\n[1] normalize()');
assert('quita tildes',         m.normalize('Peluquería Ñoño'), 'peluqueria nono');
assert('lowercase',            m.normalize('GASFITER'),         'gasfiter');
assert('colapsa espacios',     m.normalize('  food   truck  '), 'food truck');

console.log('\n[2] pickCluster() — mapping rubro -> template');
assert('gasfiter',             m.pickCluster('Gasfiter'),                   '01-tecnico');
assert('barberia',             m.pickCluster('Barberia el Capitan'),        '02-belleza-oscuro');
assert('peluqueria default',   m.pickCluster('Peluqueria femenina'),        '03-belleza-claro');
assert('peluq masc -> oscuro', m.pickCluster('Peluqueria Masculina Premium'),'02-belleza-oscuro');
assert('podologia',            m.pickCluster('Clinica del Pie - Podologia'),'04-salud');
assert('parrilla',             m.pickCluster('Parrilla La Brasa'),          '05-gastro-oscuro');
assert('cafeteria',            m.pickCluster('Cafeteria Andina'),           '06-gastro-claro');
assert('food truck',           m.pickCluster('Food Truck Ariel'),           '07-street-food');
assert('optica',               m.pickCluster('Optica Vision Total'),        '08-retail-claro');
assert('boutique',             m.pickCluster('Boutique Las Flores'),        '09-retail-calido');
assert('abogado',              m.pickCluster('Estudio Juridico Perez'),     '10-profesional');
assert('default',              m.pickCluster('Algo sin match conocido'),    '10-profesional');

console.log('\n[3] pickIconSlug() — mapping rubro -> icono Lucide');
assert('gasfiter',  m.pickIconSlug('Gasfiter'),                'wrench');
assert('barberia',  m.pickIconSlug('Barberia'),                'scissors');
assert('podologia', m.pickIconSlug('Podologia clinica'),       'footprints');
assert('cafeteria', m.pickIconSlug('Cafeteria geek'),          'coffee');
assert('food truck',m.pickIconSlug('Food Truck Ariel'),        'truck');
assert('optica',    m.pickIconSlug('Optica Vision'),           'glasses');
assert('abogado',   m.pickIconSlug('Estudio juridico'),        'scale');

console.log('\n[4] generarDistribucionEstrellas()');
const s47 = m.generarDistribucionEstrellas(4.7, 124);
assert('4.7 rating field', s47.rating, '4.7');
assert('4.7 total field',  s47.total,  124);
assert('4.7 dist suma 100',
  s47.dist[5] + s47.dist[4] + s47.dist[3] + s47.dist[2] + s47.dist[1], 100);
assert('rating <= 0 devuelve null', m.generarDistribucionEstrellas(0, 0), null);
assert('rating null devuelve null', m.generarDistribucionEstrellas(null, 0), null);

console.log('\n[5] reemplazar() — Bug 1 del brief debe quedar resuelto');
assert('preposicion huerfana antes de punto',
  m.reemplazar('los mejores {{rubro}} que hemos encontrado en {{ciudad}}.', { rubro: 'gasfiter' }),
  'los mejores gasfiter que hemos encontrado.');

assert('preposicion huerfana en string vacio',
  m.reemplazar('Servicio profesional en .', {}),
  'Servicio profesional.');

assert('preposicion huerfana antes de </p>',
  m.reemplazar('<p>Atendemos en {{ciudad}}</p>', {}),
  '<p>Atendemos</p>');

assert('frase opcional vacia se elimina',
  m.reemplazar('Servimos {{? a {{ciudad}} y vecinas ?}} con calidad.', {}),
  'Servimos con calidad.');

assert('frase opcional con valor se mantiene',
  m.reemplazar('Servimos {{? a {{ciudad}} y vecinas ?}} con calidad.', { ciudad: 'Santiago' }),
  'Servimos a Santiago y vecinas con calidad.');

assert('texto legitimo NO se toca',
  m.reemplazar('Estamos al lado de la plaza.', {}),
  'Estamos al lado de la plaza.');

assert('todas las variables reemplazadas',
  m.reemplazar('Hola {{nombre}}, somos los mejores {{rubro}} en {{ciudad}}.',
    { nombre: 'Juan', rubro: 'gasfiter', ciudad: 'Santiago' }),
  'Hola Juan, somos los mejores gasfiter en Santiago.');

console.log('\n[6] validateHtml()');
assert('no detecta issues en HTML limpio',
  m.validateHtml('<html><body><p>ok</p></body></html>'), []);

const dirty = m.validateHtml('<html>{{nombre_negocio}}<img src="" /><a href=""></a></html>');
assert('detecta variables sin reemplazar', dirty.length > 0, true);

console.log(`\nResultado: ${passed} OK, ${failed} FAIL\n`);
process.exit(failed === 0 ? 0 : 1);
