// Statistici fără cookie-uri: trimite doar tipul vizitei, pagina, site-ul de pe care vii,
// sursa campaniei (utm) și telefon/calculator. Nu salvează nimic în browser și nu trimite IP-ul în baza de date.
(function () {
  var C = window.APP_CONFIG || {}, sent = {};
  function send(kind) {
    try {
      if (sent[kind] || navigator.webdriver || location.hostname !== 'coachmeal.app' || !C.SUPABASE_URL) return;
      sent[kind] = true;
      var ref = '';
      try { if (document.referrer) { var h = new URL(document.referrer).hostname.replace(/^www\./, ''); if (h !== 'coachmeal.app') ref = h; } } catch (e) {}
      var q = new URLSearchParams(location.search), utm = [q.get('utm_source'), q.get('utm_campaign')].filter(Boolean).join('/');
      fetch(C.SUPABASE_URL + '/rest/v1/rpc/track', {
        method: 'POST', keepalive: true, credentials: 'omit',
        headers: { 'Content-Type': 'application/json', apikey: C.SUPABASE_KEY, Authorization: 'Bearer ' + C.SUPABASE_KEY },
        body: JSON.stringify({ k: kind, p: location.pathname, r: ref || null, u: utm || null, d: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop' })
      }).catch(function () {});
    } catch (e) {}
  }
  window.CMTrack = send;
  var auto = document.currentScript && document.currentScript.getAttribute('data-auto');
  if (auto) send(auto);
})();
