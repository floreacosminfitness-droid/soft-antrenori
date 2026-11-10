// completează datele firmei din config.js
(function () {
  var c = (window.APP_CONFIG && window.APP_CONFIG.COMPANY) || {}, mail = (window.APP_CONFIG || {}).CONTACT_EMAIL;
  var ids = [c.cui ? 'CUI ' + c.cui : '', c.reg ? 'nr. Reg. Com. ' + c.reg : '', c.address].filter(Boolean).join(', ');
  var who = c.name ? c.name + (ids ? ', ' + ids : '') : (ids ? 'firma cu ' + ids : '');
  document.querySelectorAll('[data-co="who"]').forEach(function (e) { if (who) e.textContent = who; });
  document.querySelectorAll('[data-co="mail"]').forEach(function (e) { if (mail) e.innerHTML = '<a href="mailto:' + mail + '">' + mail + '</a>'; });
  document.querySelectorAll('[data-co="line"]').forEach(function (e) { e.textContent = '© ' + new Date().getFullYear() + (who ? ' ' + who : ' CoachMeal'); });
})();
