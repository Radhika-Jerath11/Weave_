/* ============================================
   PAGE TRANSITION HELPER v2 — crossover style
   The .brand-panel and .form-panel each carry a data-side
   ("left" or "right") telling this script which way they live.

   On exit: the two panels swap places by sliding fully across
   each other (crossover) before the real page navigation happens.

   On the next page's load: since that page's layout is mirrored,
   the panels are already on the correct side — they just do a
   short "settle into place" entrance instead of a full crossover.
   ============================================ */
(function () {
  var NAV_FLAG = 'weaveCrossNav';

  window.crossPageNavigate = function (url) {
    var brand = document.querySelector('.brand-panel');
    var form = document.querySelector('.form-panel');

    if (brand) brand.classList.add(brand.dataset.side === 'left' ? 'cross-exit-toright' : 'cross-exit-toleft');
    if (form) form.classList.add(form.dataset.side === 'left' ? 'cross-exit-toright' : 'cross-exit-toleft');

    sessionStorage.setItem(NAV_FLAG, '1');
    setTimeout(function () {
      window.location.href = url;
    }, 500);
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (!sessionStorage.getItem(NAV_FLAG)) return;
    sessionStorage.removeItem(NAV_FLAG);

    var brand = document.querySelector('.brand-panel');
    var form = document.querySelector('.form-panel');

    if (brand) brand.classList.add(brand.dataset.side === 'left' ? 'cross-enter-fromleft' : 'cross-enter-fromright');
    if (form) form.classList.add(form.dataset.side === 'left' ? 'cross-enter-fromleft' : 'cross-enter-fromright');
  });
})();