// Meniul făcut de antrenor: o zi de mese construită din alimente, repetată toată săptămâna.
// Gramajele se pot potrivi automat la caloriile și macro-urile fiecărei mese.
// Expune window.MenuEditor.mount(el, { me, client, targets, profile }) și .setTargets(t).
(function () {
  var App = window.App, G = window.CosfitGen, sb = App.sb, esc = App.esc;
  var R = Math.round;
  var OWN_CAT = 'Alimentele antrenorului';
  var E = null; // starea editorului

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function el(id) { return document.getElementById(id); }
  function fname(x) { return x.name.replace(/ \(1 .*?\)$/, ''); }
  function foodOf(id) { return (E.draft && E.draft.foods[id]) || E.food[id]; }
  function T() { var t = E.targets; return { kcal: t.kcal, p: t.p, c: t.c, f: t.f }; }

  async function ensureContent() {
    if (E.content) return;
    var r = await sb.from('meal_content').select('data').eq('id', 1).single();
    if (r.error) throw r.error;
    E.content = r.data.data; E.food = {};
    E.content.foods.forEach(function (f) { E.food[f.id] = f; });
  }

  // ---------- ciorna ----------
  function slotsFor(n) { return G.menuSlots(n); }
  function newDraft() {
    var n = +((E.profile && E.profile.answers && E.profile.answers.meals) || 4);
    return { meals: slotsFor(n).map(function (s) { return { slot: s[1], type: s[0], name: '', note: '', items: [] }; }), foods: {}, locked: true };
  }
  function draftFrom(row) {
    return { meals: JSON.parse(JSON.stringify(row.meals)).map(function (m) { m.items = m.items || []; m.name = m.name || ''; m.note = m.note || ''; return m; }), foods: JSON.parse(JSON.stringify(row.foods || {})), locked: row.locked !== false };
  }
  function setMealCount(n) {
    var old = E.draft.meals, sl = slotsFor(n);
    // păstrăm mesele după tip (mic dejun, prânz/cină, gustări), în ordine
    var pool = { md: [], pc: [], g: [] };
    old.forEach(function (m) { pool[m.type].push(m); });
    E.draft.meals = sl.map(function (s) {
      var m = pool[s[0]].shift() || { name: '', note: '', items: [] };
      return { slot: s[1], type: s[0], name: m.name, note: m.note, items: m.items };
    });
  }
  // un gramaj de pornire firesc pentru fiecare aliment; „Potrivește” îl ajustează apoi
  function startGrams(x) {
    if (x.id === 'ou') return 110;
    if (x.kcal > 500) return 10;
    if (x.kcal > 300) return x.p > 50 ? 30 : 60;
    if (x.kcal < 45) return 150;
    var byCat = { 'Carne': 150, 'Pește': 150, 'Mezeluri': 50, 'Cartofi': 200, 'Fructe': 120, 'Panificație': 60, 'Leguminoase': 150, 'Proteine vegetale': 120 };
    if (byCat[x.cat]) return byCat[x.cat];
    if (/Lactate|Băuturi/.test(x.cat || '')) return x.kcal < 70 ? 200 : 150;
    return 100;
  }
  function itemsX(m) { return m.items.map(function (i) { return { id: i.id, g: +i.g || 0, x: foodOf(i.id) }; }).filter(function (i) { return i.x; }); }
  function mealTargets() { return G.menuMealTargets(T(), E.draft.meals.length); }
  function fitMeal(mi) {
    var m = E.draft.meals[mi], MT = mealTargets()[mi];
    if (!m.items.length) return;
    m.items = G.fitItems(itemsX(m), MT).map(function (i) { return { id: i.id, g: i.g }; });
  }

  // ---------- afișare ----------
  function macroLine(t) { return R(t.kcal) + ' kcal · ' + R(t.p) + ' P · ' + R(t.c) + ' C · ' + R(t.f) + ' G'; }
  function diffHtml(got, tg) {
    var d = got.kcal - tg.kcal, pct = tg.kcal ? Math.abs(d) / tg.kcal : 0;
    var cls = pct <= 0.05 ? 'me-ok' : pct <= 0.15 ? 'me-near' : 'me-off';
    return '<span class="me-diff ' + cls + '">' + (Math.abs(d) < 5 ? 'la țintă' : (d > 0 ? '+' : '−') + R(Math.abs(d)) + ' kcal') + '</span>';
  }
  function mealTotHtml(mi) {
    var m = E.draft.meals[mi], got = G.itemsMacros(itemsX(m)), tg = mealTargets()[mi];
    return '<b>' + macroLine(got) + '</b> ' + (m.items.length ? diffHtml(got, tg) : '') + '<br><span class="muted">Ținta mesei: ' + macroLine(tg) + '</span>';
  }
  function dayTot() { var t = { kcal: 0, p: 0, c: 0, f: 0 }; E.draft.meals.forEach(function (m) { var g = G.itemsMacros(itemsX(m)); t.kcal += g.kcal; t.p += g.p; t.c += g.c; t.f += g.f; }); return t; }
  function dayHtml() {
    var t = dayTot(), tg = T();
    var cell = function (cls, k, unit, label) { var d = t[k] - tg[k]; return '<div class="' + cls + '"><b>' + R(t[k]) + unit + '</b><span>' + label + ' · țintă ' + tg[k] + unit + (Math.abs(d) >= (k === 'kcal' ? 25 : 3) ? ' (' + (d > 0 ? '+' : '−') + R(Math.abs(d)) + ')' : ' ✓') + '</span></div>'; };
    return '<div class="tsum">' + cell('t-k', 'kcal', '', 'kcal') + cell('t-p', 'p', ' g', 'proteine') + cell('t-c', 'c', ' g', 'carbo') + cell('t-f', 'f', ' g', 'grăsimi') + '</div>';
  }
  function resultsHtml(mi) {
    var o = E.search[mi]; if (!o || !o.q || o.q.trim().length < 2) return '';
    var own = Object.keys(E.draft.foods).map(function (k) { return E.draft.foods[k]; });
    var norm = function (x) { return x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    var q = norm(o.q.trim());
    var res = own.filter(function (x) { return norm(x.name).indexOf(q) >= 0; }).concat(G.searchFoods(E.content, o.q, 8)).slice(0, 8);
    if (!res.length) return '<p class="muted small" style="margin:6px 0">Nu am găsit „' + esc(o.q) + '”. Îl poți adăuga ca aliment propriu, cu valorile de pe etichetă.</p>';
    return res.map(function (x) { return '<button type="button" class="me-res" data-add="' + mi + ':' + esc(x.id) + '"><span>' + esc(fname(x)) + '</span><small>' + R(x.kcal) + ' kcal · ' + R(x.p) + ' P · ' + R(x.c) + ' C · ' + R(x.f) + ' G la 100 g</small></button>'; }).join('');
  }
  function ownFormHtml(mi) {
    return '<div class="me-own"><p class="small" style="margin:0 0 8px"><b>Aliment propriu</b> <span class="muted">(valori la 100 g, de pe etichetă)</span></p>' +
      '<div class="field"><input id="meOwnN" type="text" maxlength="80" placeholder="Numele alimentului, ex.: Proteină whey Brand X"></div>' +
      '<div class="me-own-row">' + [['k', 'kcal'], ['p', 'Proteine'], ['c', 'Carbo'], ['f', 'Grăsimi']].map(function (x) { return '<label>' + x[1] + '<input id="meOwn' + x[0] + '" type="number" inputmode="decimal" min="0" step="0.1"></label>'; }).join('') + '</div>' +
      '<p class="msg" id="meOwnMsg" hidden></p><div class="row"><button type="button" class="btn btn-sm" data-ownadd="' + mi + '">Adaugă în masă</button><button type="button" class="linkbtn small" data-own="">Renunță</button></div></div>';
  }
  function mealHtml(m, mi) {
    var s = E.search[mi] || {};
    return '<div class="me-meal"><div class="me-mhead"><div><div class="mp-slot">' + esc(m.slot) + '</div>' +
      '<input class="me-name" data-name="' + mi + '" type="text" maxlength="80" placeholder="Numele mesei (opțional)" value="' + esc(m.name) + '"></div></div>' +
      (m.items.length ? '<ul class="me-items">' + m.items.map(function (it, ii) {
        var x = foodOf(it.id); if (!x) return '';
        var k = x.kcal * (+it.g || 0) / 100;
        return '<li><span class="me-iname">' + esc(fname(x)) + (x.cat === OWN_CAT ? ' <em class="muted">(propriu)</em>' : '') + '</span>' +
          '<label class="me-g"><input type="number" inputmode="numeric" min="1" max="3000" data-g="' + mi + ':' + ii + '" value="' + esc(it.g) + '" aria-label="Grame ' + esc(fname(x)) + '"> g</label>' +
          '<span class="me-k" id="meK_' + mi + '_' + ii + '">' + R(k) + ' kcal</span>' +
          '<button type="button" class="me-del" data-del="' + mi + ':' + ii + '" aria-label="Scoate ' + esc(fname(x)) + '">×</button></li>';
      }).join('') + '</ul>' : '<p class="muted small" style="margin:6px 0 10px">Încă niciun aliment. Caută mai jos.</p>') +
      '<div class="me-tot" id="meTot_' + mi + '">' + mealTotHtml(mi) + '</div>' +
      (m.items.length ? '<div class="row" style="margin:8px 0 10px"><button type="button" class="btn btn-ghost btn-sm" data-fit="' + mi + '">Potrivește gramajele la țintă</button></div>' : '') +
      '<div class="field" style="margin-bottom:6px"><input type="search" class="me-q" data-q="' + mi + '" autocomplete="off" placeholder="+ Adaugă aliment (ex. orez)" value="' + esc(s.q || '') + '"></div>' +
      '<div id="meRes_' + mi + '">' + resultsHtml(mi) + '</div>' +
      (E.ownFor === mi ? ownFormHtml(mi) : '<button type="button" class="linkbtn small" data-own="' + mi + '">+ Aliment care nu e în listă</button>') +
      '<details class="me-note"' + (m.note ? ' open' : '') + '><summary>Indicații pentru client</summary><textarea data-note="' + mi + '" maxlength="400" rows="2" placeholder="ex.: Orezul se cântărește crud. Puiul la grătar, fără ulei în plus.">' + esc(m.note) + '</textarea></details>' +
      '</div>';
  }

  function viewHtml() {
    var row = E.row;
    var h = '<h2>Meniul clientului</h2>';
    if (!E.targets) return h + '<p class="muted small" style="margin:0">Setează întâi caloriile clientului (mai sus). Apoi îi poți face tu meniul, dacă vrei.</p>';
    if (!row) {
      return h + '<p class="muted small">Acum ' + esc(E.client.full_name.split(/\s+/)[0]) + ' primește meniul automat, din rețete. Dacă vrei, îi faci tu meniul: alegi alimentele pentru fiecare masă, iar gramajele se potrivesc la caloriile lui. Meniul tău se repetă în fiecare zi.</p>' +
        '<button type="button" class="btn btn-ghost" data-me="start">Fac eu meniul</button>';
    }
    var mt = row.targets, stale = mt && (mt.kcal !== E.targets.kcal || mt.p !== E.targets.p || mt.c !== E.targets.c || mt.f !== E.targets.f);
    h += '<p class="pill pill-ok" style="margin:0 0 12px">Clientul urmează meniul tău, în fiecare zi · ' + (row.locked ? 'nu poate schimba alimente' : 'poate înlocui alimente și mese') + '</p>';
    if (stale) h += '<p class="msg msg-warn">Ai schimbat caloriile după ce ai făcut meniul (' + mt.kcal + ' → ' + E.targets.kcal + ' kcal). Clientul primește gramajele potrivite automat la noile ținte. Ca să le vezi și să le ajustezi tu, apasă „Modifică meniul”, apoi „Potrivește toate mesele” și salvează.</p>';
    var food = G.menuFood(E.content, row);
    h += row.meals.map(function (m) {
      var its = (m.items || []).filter(function (i) { return food[i.id]; });
      var t = G.itemsMacros(its.map(function (i) { return { g: i.g, x: food[i.id] }; }));
      return '<div class="me-sum"><div class="mp-slot">' + esc(m.slot) + (m.name ? ' · ' + esc(m.name) : '') + '</div><ul>' + its.map(function (i) { return '<li><span>' + esc(fname(food[i.id])) + '</span><span>' + i.g + ' g</span></li>'; }).join('') + '</ul><div class="muted small">' + macroLine(t) + '</div></div>';
    }).join('');
    h += '<p id="meMsg" class="msg" hidden></p><div class="row" style="margin-top:12px"><button type="button" class="btn btn-ghost btn-sm" data-me="edit">Modifică meniul</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-me="' + (E.confirmDel ? 'delyes' : 'del') + '">' + (E.confirmDel ? 'Sigur? Apasă din nou' : 'Revin la meniul automat') + '</button></div>';
    return h;
  }

  function editHtml() {
    var d = E.draft;
    return '<h2>' + (E.row ? 'Modifică meniul' : 'Fă meniul clientului') + '</h2>' +
      '<p class="muted small">Alege alimentele pentru fiecare masă și scrie gramajele, sau apasă „Potrivește gramajele” ca să ajungă la ținta mesei. Ziua asta se repetă toată săptămâna.</p>' +
      '<div class="field"><label>Mese pe zi</label><div class="seg" data-meseg="n">' + [[3, '3 mese'], [4, '3 mese + gustare'], [5, '3 mese + 2 gustări']].map(function (o) { return '<button type="button" data-v="' + o[0] + '" class="' + (d.meals.length === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div></div>' +
      d.meals.map(mealHtml).join('') +
      '<h3 style="margin:18px 0 6px">Total pe zi</h3><div id="meDay">' + dayHtml() + '</div>' +
      '<div class="row" style="margin:-4px 0 14px"><button type="button" class="btn btn-ghost btn-sm" data-me="fitall">Potrivește toate mesele</button></div>' +
      '<label class="check" style="margin:0 0 14px"><input type="checkbox" id="meFree"' + (d.locked ? '' : ' checked') + '><span>Clientul poate înlocui alimente și schimba mesele <span class="muted">(dacă nu bifezi, vede meniul exact cum l-ai făcut și doar bifează ce a mâncat)</span></span></label>' +
      '<p id="meMsg" class="msg" hidden></p>' +
      '<button type="button" class="btn btn-block" data-me="save">Salvează meniul</button>' +
      '<button type="button" class="linkbtn" data-me="cancel" style="display:block;margin:12px auto 0">Renunță</button>';
  }

  function render() {
    E.root.innerHTML = '<section class="card me">' + (E.editing ? editHtml() : viewHtml()) + '</section>';
  }
  function refreshTotals(mi) {
    var t = el('meTot_' + mi); if (t) t.innerHTML = mealTotHtml(mi);
    var d = el('meDay'); if (d) d.innerHTML = dayHtml();
  }
  function msg(text, kind) { var m = el('meMsg'); if (m) { App.msg(m, text, kind); m.scrollIntoView({ block: 'nearest' }); } }

  // ---------- acțiuni ----------
  async function save(btn) {
    var d = E.draft;
    var empty = d.meals.filter(function (m) { return !m.items.length; }).map(function (m) { return m.slot; });
    if (empty.length) return msg('Adaugă cel puțin un aliment la: ' + empty.join(', ') + '.');
    var bad = d.meals.some(function (m) { return m.items.some(function (i) { return !(+i.g >= 1 && +i.g <= 3000); }); });
    if (bad) return msg('Gramajele trebuie să fie între 1 și 3000.');
    var used = {};
    d.meals.forEach(function (m) { m.items.forEach(function (i) { if (d.foods[i.id]) used[i.id] = d.foods[i.id]; }); });
    var row = {
      client_id: E.client.id, set_by: E.me.id, updated_at: new Date().toISOString(), locked: d.locked, targets: T(), foods: used,
      meals: d.meals.map(function (m) { var o = { slot: m.slot, type: m.type, items: m.items.map(function (i) { return { id: i.id, g: R(+i.g) }; }) }; if (m.name.trim()) o.name = m.name.trim(); if (m.note.trim()) o.note = m.note.trim(); return o; })
    };
    btn.disabled = true;
    var r = await sb.from('client_menus').upsert(row, { onConflict: 'client_id' }).select('*').single();
    btn.disabled = false;
    if (r.error) return msg(App.ro(r.error));
    E.row = r.data; E.editing = false; E.draft = null; E.search = {};
    render();
    msg('Salvat. ' + E.client.full_name.split(/\s+/)[0] + ' vede meniul tău data viitoare când deschide contul.', 'ok');
  }
  async function del(btn) {
    btn.disabled = true;
    var r = await sb.from('client_menus').delete().eq('client_id', E.client.id);
    btn.disabled = false;
    if (r.error) return msg(App.ro(r.error));
    E.row = null; E.confirmDel = false; render();
  }

  function bind() {
    var root = E.root;
    root.onclick = async function (e) {
      var t = e.target;
      var b = t.closest('[data-me]');
      if (b) {
        var a = b.getAttribute('data-me');
        if (a !== 'delyes') E.confirmDel = false;
        if (a === 'start' || a === 'edit') {
          b.disabled = true;
          try { await ensureContent(); } catch (err) { b.disabled = false; return App.msg(el('meMsg') || document.createElement('p'), App.ro(err)); }
          E.draft = E.row ? draftFrom(E.row) : newDraft(); E.editing = true; E.search = {}; E.ownFor = null; render(); return;
        }
        if (a === 'cancel') { E.editing = false; E.draft = null; return render(); }
        if (a === 'fitall') { E.draft.meals.forEach(function (m, mi) { fitMeal(mi); }); return render(); }
        if (a === 'save') return save(b);
        if (a === 'del') { E.confirmDel = true; return render(); }
        if (a === 'delyes') return del(b);
      }
      var sg = t.closest('[data-meseg] button');
      if (sg) { setMealCount(+sg.getAttribute('data-v')); E.search = {}; return render(); }
      var ad = t.closest('[data-add]');
      if (ad) {
        var p = ad.getAttribute('data-add'), mi = +p.split(':')[0], id = p.slice(p.indexOf(':') + 1), x = foodOf(id);
        if (!x) return;
        var g = startGrams(x);
        E.draft.meals[mi].items.push({ id: id, g: g });
        E.search[mi] = { q: '' };
        render();
        var q = root.querySelector('[data-q="' + mi + '"]'); if (q) q.focus();
        return;
      }
      var dl = t.closest('[data-del]');
      if (dl) { var pr = dl.getAttribute('data-del').split(':').map(Number); E.draft.meals[pr[0]].items.splice(pr[1], 1); return render(); }
      var ft = t.closest('[data-fit]');
      if (ft) { fitMeal(+ft.getAttribute('data-fit')); return render(); }
      var ow = t.closest('[data-own]');
      if (ow) { var v = ow.getAttribute('data-own'); E.ownFor = v === '' ? null : +v; render(); var n = el('meOwnN'); if (n) n.focus(); return; }
      var oa = t.closest('[data-ownadd]');
      if (oa) {
        var omi = +oa.getAttribute('data-ownadd'), name = (el('meOwnN').value || '').trim();
        var vk = num(el('meOwnk').value), vp = num(el('meOwnp').value) || 0, vc = num(el('meOwnc').value) || 0, vf = num(el('meOwnf').value) || 0;
        if (!name) return App.msg(el('meOwnMsg'), 'Scrie numele alimentului.');
        if (vk == null) vk = R(vp * 4 + vc * 4 + vf * 9);
        if (!(vk > 0 && vk <= 900) || vp + vc + vf > 100) return App.msg(el('meOwnMsg'), 'Verifică valorile: la 100 g, caloriile sunt între 1 și 900, iar proteinele, carbohidrații și grăsimile adunate nu trec de 100 g.');
        var oid = 'own_' + Date.now().toString(36);
        E.draft.foods[oid] = { id: oid, name: name, cat: OWN_CAT, kcal: vk, p: vp, c: vc, f: vf, fib: 0 };
        E.draft.meals[omi].items.push({ id: oid, g: 100 });
        E.ownFor = null; return render();
      }
    };
    root.oninput = function (e) {
      var t = e.target;
      if (t.hasAttribute('data-q')) { var mi = +t.getAttribute('data-q'); E.search[mi] = { q: t.value }; var r = el('meRes_' + mi); if (r) r.innerHTML = resultsHtml(mi); return; }
      if (t.hasAttribute('data-g')) {
        var p = t.getAttribute('data-g').split(':').map(Number), it = E.draft.meals[p[0]].items[p[1]];
        it.g = num(t.value) || 0;
        var x = foodOf(it.id), k = el('meK_' + p[0] + '_' + p[1]); if (k && x) k.textContent = R(x.kcal * it.g / 100) + ' kcal';
        return refreshTotals(p[0]);
      }
      if (t.hasAttribute('data-name')) { E.draft.meals[+t.getAttribute('data-name')].name = t.value; return; }
      if (t.hasAttribute('data-note')) { E.draft.meals[+t.getAttribute('data-note')].note = t.value; return; }
    };
    root.onchange = function (e) { if (e.target.id === 'meFree') E.draft.locked = !e.target.checked; };
    root.onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (t.hasAttribute('data-q')) { e.preventDefault(); var first = el('meRes_' + t.getAttribute('data-q')).querySelector('[data-add]'); if (first) first.click(); }
      if (t.id && t.id.indexOf('meOwn') === 0) { e.preventDefault(); var ab = E.root.querySelector('[data-ownadd]'); if (ab) ab.click(); }
    };
  }

  async function mount(root, opts) {
    E = { root: root, me: opts.me, client: opts.client, targets: opts.targets, profile: opts.profile, row: null, editing: false, draft: null, search: {}, ownFor: null, content: null, food: {} };
    root.innerHTML = '<section class="card"><h2>Meniul clientului</h2><p class="muted small" style="margin:0">Se încarcă…</p></section>';
    var r = await sb.from('client_menus').select('*').eq('client_id', opts.client.id).maybeSingle();
    if (r.error) { root.innerHTML = '<section class="card"><h2>Meniul clientului</h2><p class="msg">' + esc(App.ro(r.error)) + '</p></section>'; return; }
    E.row = r.data || null;
    if (E.row) { try { await ensureContent(); } catch (err) { /* afișăm fără alimente */ E.content = { foods: [], recipes: [] }; } }
    bind(); render();
  }
  function setTargets(t) { if (!E) return; E.targets = t; if (!E.editing) render(); else { E.draft.meals.forEach(function (m, mi) { refreshTotals(mi); }); } }

  window.MenuEditor = { mount: mount, setTargets: setTargets };
})();
