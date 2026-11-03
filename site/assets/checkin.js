// Check-in: poze de progres (față / profil / spate) + măsurători opționale.
// Checkin.mountClient(el, { clientId, onWeight })  -> clientul trimite și își vede istoricul
// Checkin.mountTrainer(el, clientId)                -> antrenorul vede comparația și evoluția
(function () {
  var App = window.App, sb = App.sb, esc = App.esc, dec = App.dec;
  var POSES = [['front', 'Față'], ['side', 'Profil'], ['back', 'Spate']];
  var MS = [['waist', 'Talie'], ['hips', 'Șold'], ['chest', 'Piept'], ['arm', 'Braț'], ['thigh', 'Coapsă']];
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function fd(s) { return App.fmtDate(s + 'T12:00:00Z'); }
  function poseName(k) { var p = POSES.find(function (x) { return x[0] === k; }); return p ? p[1] : k; }

  async function loadList(clientId) {
    var r = await sb.from('checkins').select('*').eq('client_id', clientId).order('taken_on', { ascending: true }).limit(200);
    if (r.error) throw r.error;
    var list = r.data || [];
    var paths = []; list.forEach(function (c) { (c.photos || []).forEach(function (p) { paths.push(p.path); }); });
    var urls = await App.signedUrls(paths);
    return { list: list, urls: urls };
  }

  function valsText(c) {
    var parts = [];
    if (c.weight_kg != null) parts.push(dec(+c.weight_kg) + ' kg');
    MS.forEach(function (m) { if (c[m[0]] != null) parts.push(m[1] + ' ' + dec(+c[m[0]]) + ' cm'); });
    return parts.join(' · ');
  }
  function thumbs(c, urls) {
    var ps = (c.photos || []).filter(function (p) { return urls[p.path]; });
    if (!ps.length) return '';
    return '<div class="ck-thumbs">' + ps.map(function (p) { return '<a href="' + esc(urls[p.path]) + '" target="_blank" rel="noopener" title="' + poseName(p.pose) + '"><img src="' + esc(urls[p.path]) + '" alt="' + poseName(p.pose) + ', ' + fd(c.taken_on) + '" loading="lazy"></a>'; }).join('') + '</div>';
  }
  // graficul unei măsurători, cu file pentru fiecare măsurătoare care are date
  function msChartHtml(list, key) {
    var keys = MS.filter(function (m) { return list.filter(function (c) { return c[m[0]] != null; }).length >= 1; });
    if (!keys.length) return { html: '', key: null };
    if (!keys.some(function (m) { return m[0] === key; })) key = keys[0][0];
    var pts = list.filter(function (c) { return c[key] != null; }).map(function (c) { return { d: c.taken_on, v: +c[key] }; });
    var label = MS.find(function (m) { return m[0] === key; })[1];
    return { key: key, html: '<h3 style="margin:16px 0 6px">Măsurători</h3><div class="seg" data-ckms>' + keys.map(function (m) { return '<button type="button" data-v="' + m[0] + '" class="' + (m[0] === key ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div>' + App.lineChart(pts, 'cm', label) };
  }

  // ======================= CLIENT =======================
  function mountClient(el, opts) {
    var S = { list: [], urls: {}, open: false, files: {}, previews: {}, msKey: 'waist', busy: false, arm: null };

    function formHtml() {
      return '<div class="mp-box" style="background:#faf9f6"><p style="font-weight:600;margin:0 0 6px">Check-in nou</p>' +
        '<p class="hint">Pozele le vezi doar tu și antrenorul tău. Fă-le în aceeași lumină și ținută de fiecare dată, ca să se vadă diferența.</p>' +
        '<div class="ck-poses">' + POSES.map(function (p) {
          var pv = S.previews[p[0]];
          return '<label class="ck-pose' + (pv ? ' has' : '') + '" for="ck_' + p[0] + '">' + (pv ? '<img src="' + pv + '" alt=""><button type="button" class="x" data-ckrm="' + p[0] + '" aria-label="Scoate poza">×</button>' : '<span><b>' + p[1] + '</b>adaugă poză</span>') +
            '<input id="ck_' + p[0] + '" data-ckpose="' + p[0] + '" type="file" accept="image/*" hidden></label>';
        }).join('') + '</div>' +
        '<div class="ck-ms"><div class="field"><label for="ck_w">Greutate (kg)</label><input id="ck_w" type="number" inputmode="decimal" step="0.1" min="30" max="300"></div>' +
        MS.map(function (m) { return '<div class="field"><label for="ck_' + m[0] + '">' + m[1] + ' (cm)</label><input id="ck_' + m[0] + '" data-ckms-in="' + m[0] + '" type="number" inputmode="decimal" step="0.1" min="10" max="300"></div>'; }).join('') + '</div>' +
        '<div class="field"><label for="ck_note">Notă pentru antrenor <span class="muted">(opțional)</span></label><textarea id="ck_note" maxlength="500" placeholder="ex.: săptămâna asta am avut mai puțină energie"></textarea></div>' +
        '<p class="msg" id="ckMsg" hidden></p>' +
        '<div class="row"><button type="button" class="btn" data-ck="save">' + (S.busy ? 'Se trimite…' : 'Trimite check-in-ul') + '</button><button type="button" class="linkbtn" data-ck="cancel">Renunță</button></div></div>';
    }
    function render() {
      var h = '<section class="card" id="ckCard"><h2>Check-in</h2><p class="muted small">Poze de progres și, dacă vrei, măsurători. Antrenorul tău le primește și vede evoluția. Ideal o dată la 2 săptămâni.</p>';
      h += S.open ? formHtml() : '<button type="button" class="btn" data-ck="new">Fă un check-in</button>';
      if (S.flash) { h += '<p class="msg msg-ok" style="margin-top:12px">' + esc(S.flash) + '</p>'; S.flash = ''; }
      var mc = msChartHtml(S.list, S.msKey); S.msKey = mc.key || S.msKey; h += mc.html;
      if (S.list.length) {
        h += '<h3 style="margin:16px 0 0">Istoric</h3><ul class="ck-list">' + S.list.slice().reverse().map(function (c) {
          return '<li><div class="ck-head"><b>' + fd(c.taken_on) + '</b><button type="button" class="linkbtn small" data-ckdel="' + c.id + '">' + (S.arm === c.id ? 'Sigur ștergi?' : 'șterge') + '</button></div>' +
            (valsText(c) ? '<div class="ck-vals">' + esc(valsText(c)) + '</div>' : '') + thumbs(c, S.urls) +
            (c.note ? '<p class="small" style="margin:6px 0 0">„' + esc(c.note) + '”</p>' : '') + '</li>';
        }).join('') + '</ul>';
      }
      el.innerHTML = h + '</section>';
    }
    async function reload() { try { var r = await loadList(opts.clientId); S.list = r.list; S.urls = r.urls; } catch (e) { S.flash = ''; } render(); }

    async function save() {
      var m = el.querySelector('#ckMsg');
      var row = { taken_on: today() }, bad = false, any = false;
      var w = el.querySelector('#ck_w').value;
      if (w !== '') { var wv = num(w); if (!(wv >= 30 && wv <= 300)) bad = 'Scrie greutatea în kilograme (de exemplu 78,4).'; else { row.weight_kg = Math.round(wv * 10) / 10; any = true; } }
      MS.forEach(function (x) {
        var v = el.querySelector('#ck_' + x[0]).value; if (v === '') return;
        var n = num(v); if (!(n >= 10 && n <= 300)) bad = 'Scrie măsurătorile în centimetri (de exemplu 82,5).'; else { row[x[0]] = Math.round(n * 10) / 10; any = true; }
      });
      var note = el.querySelector('#ck_note').value.trim(); if (note) row.note = note.slice(0, 500);
      var poses = Object.keys(S.files);
      if (bad) return App.msg(m, bad);
      if (!poses.length && !any) return App.msg(m, 'Adaugă cel puțin o poză sau o măsurătoare.');
      S.busy = true; var btn = el.querySelector('[data-ck=save]'); btn.disabled = true; btn.textContent = 'Se trimite…'; App.msg(m, '');
      var uploaded = [];
      try {
        for (var i = 0; i < poses.length; i++) {
          var p = poses[i], blob = await App.compressImage(S.files[p]);
          var path = opts.clientId + '/' + Date.now() + '-' + p + '.jpg';
          var up = await sb.storage.from('checkins').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
          if (up.error) throw up.error;
          uploaded.push({ pose: p, path: path });
        }
        row.photos = uploaded;
        var ins = await sb.from('checkins').insert(row).select('*').single();
        if (ins.error) throw ins.error;
        if (row.weight_kg && opts.onWeight) await opts.onWeight(row.taken_on, row.weight_kg);
      } catch (e) {
        if (uploaded.length) sb.storage.from('checkins').remove(uploaded.map(function (x) { return x.path; }));
        S.busy = false; btn.disabled = false; btn.textContent = 'Trimite check-in-ul';
        return App.msg(m, App.ro(e));
      }
      clearPreviews(); S.busy = false; S.open = false; S.flash = 'Check-in trimis. Antrenorul tău îl vede acum.';
      await reload();
      var card = el.querySelector('#ckCard'); if (card) card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    function clearPreviews() { Object.keys(S.previews).forEach(function (k) { URL.revokeObjectURL(S.previews[k]); }); S.previews = {}; S.files = {}; }
    // păstrează ce era scris în formular când se re-desenează (după ce adaugi o poză)
    function keepInputs(fn) {
      var vals = {}; el.querySelectorAll('.mp-box input[type=number], .mp-box textarea').forEach(function (i) { vals[i.id] = i.value; });
      fn(); Object.keys(vals).forEach(function (id) { var i = el.querySelector('#' + id); if (i) i.value = vals[id]; });
    }

    el.addEventListener('click', async function (e) {
      var t = e.target;
      var rm = t.closest('[data-ckrm]');
      if (rm) { e.preventDefault(); var k = rm.getAttribute('data-ckrm'); URL.revokeObjectURL(S.previews[k]); delete S.previews[k]; delete S.files[k]; return keepInputs(render); }
      var b = t.closest('[data-ck]');
      if (b) {
        var a = b.getAttribute('data-ck');
        if (a === 'new') { S.open = true; return render(); }
        if (a === 'cancel') { clearPreviews(); S.open = false; return render(); }
        if (a === 'save' && !S.busy) return save();
      }
      var ms = t.closest('[data-ckms] button'); if (ms) { S.msKey = ms.getAttribute('data-v'); return keepInputs(render); }
      var del = t.closest('[data-ckdel]');
      if (del) {
        var id = +del.getAttribute('data-ckdel');
        if (S.arm !== id) { S.arm = id; keepInputs(render); setTimeout(function () { if (S.arm === id) { S.arm = null; keepInputs(render); } }, 4000); return; }
        var c = S.list.find(function (x) { return x.id === id; });
        var r = await sb.from('checkins').delete().eq('id', id);
        if (!r.error && c && (c.photos || []).length) await sb.storage.from('checkins').remove(c.photos.map(function (p) { return p.path; }));
        S.arm = null; return reload();
      }
    });
    el.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-ckpose'); if (!k) return;
      var f = e.target.files && e.target.files[0]; if (!f) return;
      if (!/^image\//.test(f.type)) { var m = el.querySelector('#ckMsg'); return App.msg(m, 'Alege o poză (JPG sau PNG).'); }
      if (S.previews[k]) URL.revokeObjectURL(S.previews[k]);
      S.files[k] = f; S.previews[k] = URL.createObjectURL(f);
      keepInputs(render);
    });

    render(); reload();
  }

  // ======================= ANTRENOR =======================
  async function mountTrainer(el, clientId) {
    var S = { list: [], urls: {}, msKey: 'waist' };
    el.innerHTML = '<section class="card"><h2>Check-in-uri</h2><p class="muted small">Se încarcă…</p></section>';
    try { var r = await loadList(clientId); S.list = r.list; S.urls = r.urls; }
    catch (e) { el.innerHTML = '<section class="card"><h2>Check-in-uri</h2><p class="msg">' + esc(App.ro(e)) + '</p></section>'; return; }

    function compareHtml() {
      var withPh = S.list.filter(function (c) { return (c.photos || []).some(function (p) { return S.urls[p.path]; }); });
      if (withPh.length < 1) return '';
      var first = withPh[0], last = withPh[withPh.length - 1];
      var h = '<h3 style="margin:4px 0 6px">' + (withPh.length > 1 ? 'Început → acum' : 'Primele poze') + '</h3>';
      POSES.forEach(function (p) {
        var a = (first.photos || []).find(function (x) { return x.pose === p[0]; }), b = (last.photos || []).find(function (x) { return x.pose === p[0]; });
        if (!a && !b) return;
        h += '<div class="ck-compare">' +
          (a && S.urls[a.path] ? '<figure><a href="' + esc(S.urls[a.path]) + '" target="_blank" rel="noopener"><img src="' + esc(S.urls[a.path]) + '" alt="' + p[1] + ', ' + fd(first.taken_on) + '"></a><figcaption>' + p[1] + ' · ' + fd(first.taken_on) + '</figcaption></figure>' : '<figure></figure>') +
          (withPh.length > 1 && b && S.urls[b.path] ? '<figure><a href="' + esc(S.urls[b.path]) + '" target="_blank" rel="noopener"><img src="' + esc(S.urls[b.path]) + '" alt="' + p[1] + ', ' + fd(last.taken_on) + '"></a><figcaption>' + p[1] + ' · ' + fd(last.taken_on) + '</figcaption></figure>' : '<figure></figure>') +
          '</div>';
      });
      return h;
    }
    function tableHtml() {
      var rows = [['weight_kg', 'Greutate', 'kg']].concat(MS.map(function (m) { return [m[0], m[1], 'cm']; })).filter(function (r) { return S.list.some(function (c) { return c[r[0]] != null; }); });
      if (!rows.length) return '';
      return '<table class="ck-table"><thead><tr><th></th><th>La început</th><th>Acum</th><th>Diferență</th></tr></thead><tbody>' + rows.map(function (r) {
        var vs = S.list.filter(function (c) { return c[r[0]] != null; }), a = +vs[0][r[0]], b = +vs[vs.length - 1][r[0]], d = Math.round((b - a) * 10) / 10;
        return '<tr><td>' + r[1] + '</td><td>' + dec(a) + '</td><td>' + dec(b) + '</td><td class="' + (d < 0 ? 'down' : d > 0 ? 'up' : '') + '">' + (vs.length > 1 ? (d > 0 ? '+' : d < 0 ? '−' : '') + dec(Math.abs(d)) + ' ' + r[2] : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
    function render() {
      var h = '<section class="card"><h2>Check-in-uri</h2>';
      if (!S.list.length) { el.innerHTML = h + '<p class="muted small" style="margin:0">Clientul nu a trimis încă niciun check-in (poze sau măsurători).</p></section>'; return; }
      h += '<p class="muted small">' + S.list.length + (S.list.length === 1 ? ' check-in' : ' check-in-uri') + ' · ultimul pe ' + fd(S.list[S.list.length - 1].taken_on) + '</p>';
      h += compareHtml() + tableHtml();
      var mc = msChartHtml(S.list, S.msKey); S.msKey = mc.key || S.msKey; h += mc.html;
      h += '<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">Toate check-in-urile</summary><ul class="ck-list">' + S.list.slice().reverse().map(function (c) {
        return '<li><div class="ck-head"><b>' + fd(c.taken_on) + '</b></div>' + (valsText(c) ? '<div class="ck-vals">' + esc(valsText(c)) + '</div>' : '') + thumbs(c, S.urls) + (c.note ? '<p class="small" style="margin:6px 0 0">„' + esc(c.note) + '”</p>' : '') + '</li>';
      }).join('') + '</ul></details>';
      el.innerHTML = h + '</section>';
    }
    el.onclick = function (e) { var ms = e.target.closest('[data-ckms] button'); if (ms) { S.msKey = ms.getAttribute('data-v'); render(); } };
    render();
  }

  window.Checkin = { mountClient: mountClient, mountTrainer: mountTrainer };
})();
