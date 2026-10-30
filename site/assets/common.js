// Lucruri folosite de toate paginile.
(function () {
  var C = window.APP_CONFIG;
  var configured = C && C.SUPABASE_URL.indexOf('PROIECTUL-TAU') < 0 && C.SUPABASE_KEY.indexOf('PUNE_CHEIA') < 0;

  var sb = configured
    ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function show(el, on) { if (el) el.hidden = !on; }

  function msg(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg' + (kind ? ' msg-' + kind : '');
    el.hidden = !text;
  }

  // Mesajele de eroare de la Supabase vin în engleză; le traducem pe cele uzuale.
  function ro(err) {
    var m = (err && (err.message || err.error_description)) || String(err || '');
    if (/Invalid login credentials/i.test(m)) return 'Emailul sau parola nu sunt corecte.';
    if (/Email not confirmed/i.test(m)) return 'Confirmă întâi adresa de email: am trimis un link în căsuța ta (verifică și Spam).';
    if (/already registered|already been registered|User already exists/i.test(m)) return 'Există deja un cont cu acest email. Intră în cont sau folosește „Am uitat parola”.';
    if (/Password should be at least|weak.?password/i.test(m)) return 'Parola trebuie să aibă cel puțin 8 caractere.';
    if (/invalid.*email|Unable to validate email/i.test(m)) return 'Adresa de email nu pare corectă.';
    if (/rate limit|too many|For security purposes/i.test(m)) return 'Prea multe încercări. Așteaptă un minut și încearcă din nou.';
    if (/COD_INVITARE_INVALID/i.test(m)) return 'Link-ul de invitare nu mai e valabil. Cere-i antrenorului link-ul nou.';
    if (/Database error saving new user/i.test(m)) return 'Contul nu a putut fi creat. Verifică link-ul de la antrenor și încearcă din nou.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Nu am putut ajunge la server. Verifică internetul și încearcă din nou.';
    if (/mime|file type|not supported/i.test(m)) return 'Logo-ul trebuie să fie PNG, JPG sau WEBP.';
    if (/exceeded|too large|maximum allowed size/i.test(m)) return 'Logo-ul e prea mare; maximum 1 MB.';
    return 'A apărut o eroare: ' + m;
  }

  async function account() {
    var s = await sb.auth.getSession();
    if (!s.data.session) return null;
    var r = await sb.rpc('my_account');
    if (r.error) throw r.error;
    return r.data; // { role: 'trainer' | 'client' | null, ... }
  }

  function homeFor(role) {
    return role === 'trainer' ? 'antrenor.html' : role === 'client' ? 'client.html' : 'index.html';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function ago(iso) {
    if (!iso) return 'încă nu a intrat';
    var days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
    if (days <= 0) return 'azi';
    if (days === 1) return 'ieri';
    return 'acum ' + days + ' zile';
  }

  function base() {
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }

  function notConfigured() {
    document.body.innerHTML =
      '<main class="wrap narrow"><div class="card"><h1>Lipsește conectarea la Supabase</h1>' +
      '<p>Completează <code>assets/config.js</code> cu Project URL și cheia Publishable din proiectul Supabase nou. Pașii sunt în <code>CITESTE-MA.md</code>.</p></div></main>';
  }

  window.App = {
    sb: sb, configured: configured, config: C,
    $: $, esc: esc, show: show, msg: msg, ro: ro,
    account: account, homeFor: homeFor, fmtDate: fmtDate, ago: ago, base: base,
    notConfigured: notConfigured
  };
})();
