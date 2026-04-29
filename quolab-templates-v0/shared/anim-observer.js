/* QUOLAB ANIM OBSERVER — script comun a los 10 templates.
   - Activa las animaciones de tipo A (fade-in + slide leve) cuando el elemento entra al viewport.
   - Una vez animado, queda visible: no se vuelve a ocultar al salir.
   - Se inyecta inline en el HTML final por el assembler.
   Uso en cualquier template:
     <div class="ql-anim">...</div>
     <ul class="ql-stagger">...</ul>     // anima los hijos en cascada
   El hero usa animacion B (slide stagger desde abajo) que se dispara al cargar la pagina,
   no por viewport. Esa logica vive en la clase .ql-hero-stagger inline del template. */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    document.querySelectorAll('.ql-anim, .ql-stagger').forEach(function (el) {
      el.classList.add('is-visible');
    });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  function init() {
    document.querySelectorAll('.ql-anim, .ql-stagger').forEach(function (el) {
      io.observe(el);
    });
    var hero = document.querySelector('.ql-hero-stagger');
    if (hero) {
      requestAnimationFrame(function () { hero.classList.add('is-visible'); });
    }

    // Safety net: si por algun motivo el IO no dispara (entornos headless,
    // tabs en background, o algun error de paint), tras 2s marcamos todo
    // como visible para que la pagina nunca quede en blanco.
    setTimeout(function () {
      document.querySelectorAll('.ql-anim:not(.is-visible), .ql-stagger:not(.is-visible)').forEach(function (el) {
        el.classList.add('is-visible');
      });
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
