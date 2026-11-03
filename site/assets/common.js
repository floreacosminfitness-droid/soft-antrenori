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
    if (/email rate limit/i.test(m)) return 'Nu am putut trimite acum emailul de confirmare. Încearcă din nou mai târziu sau anunță-ți antrenorul.';
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

  // ---- grafic simplu (SVG) pentru greutate și măsurători ----
  // pts: [{ d: 'YYYY-MM-DD', v: număr }], unit: 'kg' / 'cm'
  function dec(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function lineChart(pts, unit, label) {
    if (!pts || !pts.length) return '';
    var W = 600, H = 230, L = 62, Rr = 16, T = 16, B = 40;
    var vs = pts.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    var pad = Math.max(0.5, (hi - lo) * 0.15); lo -= pad; hi += pad;
    var t0 = Date.parse(pts[0].d + 'T12:00:00Z'), t1 = Date.parse(pts[pts.length - 1].d + 'T12:00:00Z');
    var x = function (d) { return pts.length === 1 ? (L + W - Rr) / 2 : L + (Date.parse(d + 'T12:00:00Z') - t0) / Math.max(1, t1 - t0) * (W - L - Rr); };
    var y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var grid = '', i;
    for (i = 0; i <= 3; i++) {
      var gv = lo + (hi - lo) * i / 3, gy = y(gv);
      grid += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + gy + '" y2="' + gy + '" stroke="#e4e2dc" stroke-width="1"/>' +
        '<text x="' + (L - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="19" fill="#6b6a66">' + dec(gv) + '</text>';
    }
    var fmt = function (d) { var dt = new Date(d + 'T12:00:00Z'); return dt.getUTCDate() + ' ' + ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'][dt.getUTCMonth()]; };
    var xl = '<text x="' + x(pts[0].d) + '" y="' + (H - 10) + '" text-anchor="start" font-size="19" fill="#6b6a66">' + fmt(pts[0].d) + '</text>';
    if (pts.length > 1) xl += '<text x="' + x(pts[pts.length - 1].d) + '" y="' + (H - 10) + '" text-anchor="end" font-size="19" fill="#6b6a66">' + fmt(pts[pts.length - 1].d) + '</text>';
    var path = pts.map(function (p, k) { return (k ? 'L' : 'M') + x(p.d).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
    var dots = pts.map(function (p) { return '<circle cx="' + x(p.d).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="6" fill="#1f6f5c"><title>' + fmt(p.d) + ': ' + dec(p.v) + ' ' + unit + '</title></circle>'; }).join('');
    var first = pts[0].v, last = pts[pts.length - 1].v, diff = Math.round((last - first) * 10) / 10;
    var stats = '<div class="chart-stats"><div><b>' + dec(last) + ' ' + unit + '</b><span>acum</span></div>' +
      '<div><b>' + (diff > 0 ? '+' : diff < 0 ? '−' : '') + dec(Math.abs(diff)) + ' ' + unit + '</b><span>față de început</span></div>' +
      '<div><b>' + pts.length + '</b><span>' + (pts.length === 1 ? 'înregistrare' : 'înregistrări') + '</span></div></div>';
    return stats + '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label || 'Evoluție') + ': de la ' + dec(first) + ' la ' + dec(last) + ' ' + unit + '">' +
      grid + xl + '<path d="' + path + '" fill="none" stroke="#1f6f5c" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>' + dots + '</svg>';
  }

  // ---- poze: micșorate în browser înainte de urcare (max 1400 px, JPEG) ----
  function compressImage(file, max) {
    max = max || 1400;
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? ok(b) : no(new Error('Nu am putut citi poza.')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('Nu am putut citi poza. Încearcă o poză JPG sau PNG.')); };
      img.src = url;
    });
  }

  // linkuri temporare (1 oră) pentru pozele private de check-in
  async function signedUrls(paths) {
    if (!paths.length) return {};
    var r = await sb.storage.from('checkins').createSignedUrls(paths, 3600);
    var out = {};
    (r.data || []).forEach(function (x) { if (x.signedUrl) out[x.path] = x.signedUrl; });
    return out;
  }

  window.App = {
    lineChart: lineChart, compressImage: compressImage, signedUrls: signedUrls, dec: dec,
    sb: sb, configured: configured, config: C,
    $: $, esc: esc, show: show, msg: msg, ro: ro,
    account: account, homeFor: homeFor, fmtDate: fmtDate, ago: ago, base: base,
    notConfigured: notConfigured
  };
})();
