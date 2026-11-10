// Butonul „Instalează pe telefon” de pe paginile de intrare.
// Android / Chrome / Edge: deschide fereastra de instalare a browserului.
// iPhone / iPad (Safari): arată pașii „Partajează → Adaugă pe ecranul principal”.
// Dacă aplicația rulează deja instalată, butonul nu apare.
(function () {
  var box = document.getElementById('installBox');
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  if (!box) return;

  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (standalone) return;

  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var iosOther = ios && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua); // Chrome / Firefox pe iPhone
  var mobile = ios || /Android|Mobi/.test(ua);
  var deferred = null;

  var SHARE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  var PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="vertical-align:-3px"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

  function steps() {
    if (ios) {
      return '<ol class="inst-steps">' +
        (iosOther ? '<li>Deschide pagina asta în <b>Safari</b> (pe iPhone, doar din Safari se poate instala).</li>' : '') +
        '<li>Apasă butonul <b>Partajează</b> ' + SHARE + ' din bara de jos a ecranului.</li>' +
        '<li>Derulează și alege <b>Adaugă pe ecranul principal</b> ' + PLUS + '.</li>' +
        '<li>Apasă <b>Adaugă</b>. Aplicația apare pe ecran, cu iconița CoachMeal.</li></ol>';
    }
    if (mobile) {
      return '<ol class="inst-steps"><li>Apasă meniul browserului <b>⋮</b> (sus, în dreapta).</li>' +
        '<li>Alege <b>Instalează aplicația</b> sau <b>Adaugă pe ecranul de pornire</b>.</li>' +
        '<li>Confirmă. Aplicația apare pe ecran, cu iconița CoachMeal.</li></ol>';
    }
    return '<p class="small muted" style="margin:8px 0 0">Deschide <b>' + location.host + '</b> pe telefon, în browser, și apasă aici același buton. ' +
      'Pe calculator, în Chrome sau Edge, poți folosi iconița de instalare din bara de adrese.</p>';
  }

  var sub = box.getAttribute('data-sub') || 'Planuri alimentare';
  var ICON = '<img class="inst-ico" src="assets/icons/apple-touch-icon.png" alt="" width="60" height="60">';
  var DL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>';
  function phone() {
    // un ecran de telefon în miniatură: CoachMeal printre alte aplicații, exact cum apare după instalare
    var ghost = function (c) { return '<span class="inst-app"><i style="background:' + c + '"></i><em></em></span>'; };
    return '<div class="inst-phone" aria-hidden="true"><div class="inst-screen">' +
      '<div class="inst-bar"><span>9:41</span><span class="inst-sig"><b></b><b></b><b></b></span></div>' +
      '<div class="inst-grid">' + ghost('#FFD84D') + ghost('#9EE6C1') + '<span class="inst-app inst-me">' + ICON + '<em>CoachMeal</em></span>' + ghost('#C7B8FF') +
      ghost('#FFB8D2') + ghost('#a9bcff') + ghost('#D9FF5B') + ghost('#ffc9a8') + '</div></div></div>';
  }
  function render(open) {
    box.innerHTML = '<div class="inst-card">' + phone() +
      '<div class="inst-row">' + ICON + '<div class="inst-txt"><b>CoachMeal</b><span>' + sub + '</span><small>Aplicație pentru telefon</small></div></div>' +
      '<button type="button" class="inst-get" id="instBtn">' + DL + '<span>Instalează pe telefon</span></button>' +
      '<p class="inst-note">Se deschide dintr-o atingere, ca orice aplicație, fără să mai cauți site-ul.</p>' +
      (open ? '<div class="inst-help" id="instHelp">' + steps() + '</div>' : '') + '</div>';
    box.hidden = false;
    document.getElementById('instBtn').addEventListener('click', onClick);
  }

  async function onClick() {
    if (deferred) {
      var ev = deferred; deferred = null;
      ev.prompt();
      try {
        var choice = await ev.userChoice;
        if (choice && choice.outcome === 'accepted') { box.innerHTML = '<p class="small center" style="margin:0">Gata! Găsești CoachMeal pe ecranul telefonului.</p>'; return; }
      } catch (e) { /* ignorăm */ }
      render(false);
      return;
    }
    render(!document.getElementById('instHelp'));
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; render(false); });
  window.addEventListener('appinstalled', function () { deferred = null; box.innerHTML = '<p class="small center" style="margin:0">Gata! Găsești CoachMeal pe ecranul telefonului.</p>'; });
  render(false);
})();
