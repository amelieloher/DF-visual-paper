// "Download PDF" (site/downloads.css): the <details> disclosure already
// opens and closes with Enter/Space and without script; this only closes it
// on Escape (focus back on the button), on a click elsewhere, and once a
// link has been chosen.
(function () {
  function init() {
    var menus = document.querySelectorAll('[data-pdf-downloads]');
    Array.prototype.forEach.call(menus, function (menu) {
      var summary = menu.querySelector('summary');
      menu.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.open) {
          menu.open = false;
          if (summary) summary.focus();
          e.stopPropagation();
        }
      });
      menu.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('a')) setTimeout(function () { menu.open = false; }, 0);
      });
      document.addEventListener('click', function (e) {
        if (menu.open && !menu.contains(e.target)) menu.open = false;
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
