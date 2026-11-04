// Fișa clientului în panoul antrenorului: datele clientului, calculatorul și țintele.
// Expune window.TrainerClient.open(client, onBack).
(function () {
  var App = window.App, G = window.CosfitGen, sb = App.sb, esc = App.esc, $ = App.$;
  var R = Math.round;
  var ACT = [['sedentar', 'Sedentar (fără sport)'], ['usor', 'Ușor activ (1–3 antrenamente/săpt.)'], ['moderat', 'Moderat activ (3–5 antrenamente/săpt.)'], ['activ', 'Foarte activ (6–7 antrenamente/săpt.)'], ['foarte_activ', 'Extrem de activ (muncă fizică + sport)']];
  var GOAL = [['slabire', 'Slăbire'], ['mentinere', 'Menținere'], ['masa', 'Masă musculară']];
  var DIET = { clasic: 'De toate', vegetarian: 'Vegetarian', fara_lactoza: 'Fără lactoză', vegetarian_fara_lactoza: 'Vegetarian și fără lactoză' };
  var MEALS = { 3: '3 mese', 4: '3 mese + gustare', 5: '3 mese + 2 gustări' };
  var VARIETY = { same: 'aceleași mese zilnic', vary: 'mese diferite' };

  var S = null; // starea fișei deschise

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function dec1(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function floorFor(inp) {
    var t = G.targets(inp);
    return { min: Math.max(G.CONFIG.minKcal[inp.sex === 'f' ? 'f' : 'm'], t.bmr), bmr: t.bmr };
  }

  // --- calculul țintelor din ce e scris în editor, după modul ales ---
  function compute() {
    var e = S.ed, w = num(S.inp.weight) || 0, k, p, c, f;
    if (e.mode === 'g') {
      p = num(e.p) || 0; c = num(e.c) || 0; f = num(e.f) || 0;
      k = p * 4 + c * 4 + f * 9;
    } else if (e.mode === 'pct') {
      k = num(e.kcal) || 0;
      p = k * (num(e.pp) || 0) / 100 / 4; c = k * (num(e.cp) || 0) / 100 / 4; f = k * (num(e.fp) || 0) / 100 / 9;
    } else { // g/kg
      k = num(e.kcal) || 0;
      p = w * (num(e.pkg) || 0); f = w * (num(e.fkg) || 0);
      c = (k - p * 4 - f * 9) / 4;
    }
    var out = { kcal: R(k), p: R(p), c: R(c), f: R(f) };
    var errs = [];
    if (e.mode === 'pct') {
      var sum = (num(e.pp) || 0) + (num(e.cp) || 0) + (num(e.fp) || 0);
      if (Math.abs(sum - 100) > 0.5) errs.push('Procentele trebuie să adune 100% (acum: ' + dec1(sum) + '%).');
    }
    if (e.mode === 'gkg' && !w) errs.push('Pentru g/kg e nevoie de greutatea clientului.');
    if (out.c < 0) errs.push('Proteinele și grăsimile depășesc caloriile: carbohidrații ar ieși negativi. Scade proteinele sau grăsimile, ori crește caloriile.');
    if (out.kcal < 800 || out.kcal > 6000) errs.push('Caloriile trebuie să fie între 800 și 6000.');
    return { t: out, errs: errs };
  }

  // completează câmpurile tuturor modurilor din ținte (când se schimbă modul sau se aplică un calcul)
  function fillEditor(t, mode) {
    var w = num(S.inp.weight) || 0, k = t.p * 4 + t.c * 4 + t.f * 9 || 1;
    S.ed = {
      mode: mode || (S.ed && S.ed.mode) || 'pct',
      kcal: t.kcal, p: t.p, c: t.c, f: t.f,
      pp: R(t.p * 4 / k * 100), cp: R(t.c * 4 / k * 100), fp: 100 - R(t.p * 4 / k * 100) - R(t.c * 4 / k * 100),
      pkg: w ? Math.round(t.p / w * 10) / 10 : 2, fkg: w ? Math.round(t.f / w * 10) / 10 : 0.8
    };
  }

  function suggestion() {
    var i = S.inp;
    if (!(num(i.age) && num(i.height) && num(i.weight))) return null;
    return G.targets({ sex: i.sex, age: num(i.age), height: num(i.height), weight: num(i.weight), activity: i.activity, goal: i.goal });
  }

  // ---------------- render ----------------
  function seg(name, opts, val) {
    return '<div class="seg" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '" class="' + (String(o[0]) === String(val) ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function prefsHtml() {
    var a = S.profile && S.profile.answers;
    if (!a) return '<p class="muted small" style="margin:0">Clientul nu și-a completat încă datele și preferințele. Poți totuși să-i calculezi și să-i setezi caloriile mai jos.</p>';
    var ex = (a.exclude || []).length;
    return '<div class="facts">' +
      '<div><span>Dietă</span><b>' + esc(DIET[a.diet] || a.diet || '—') + '</b></div>' +
      '<div><span>Mese pe zi</span><b>' + esc(MEALS[a.meals] || a.meals || '—') + '</b></div>' +
      '<div><span>Timp de gătit</span><b>' + (a.maxMinutes ? 'până la ' + a.maxMinutes + ' min' : 'oricât') + '</b></div>' +
      '<div><span>Alimente excluse</span><b>' + (ex ? ex : 'niciunul') + '</b></div>' +
      '<div><span>Meniu</span><b>' + (VARIETY[a.variety] || VARIETY.vary) + '</b></div>' +
      '</div><p class="muted small" style="margin:10px 0 0">Datele au fost completate de client pe ' + App.fmtDate(S.profile.updated_at) + '.</p>';
  }

  function calcHtml() {
    var i = S.inp, sug = suggestion();
    var h = '<div class="calc">' +
      '<div class="field"><label>Sex</label>' + seg('sex', [['m', 'Bărbat'], ['f', 'Femeie']], i.sex) + '</div>' +
      '<div class="row3"><div class="field"><label for="tcAge">Vârstă</label><input id="tcAge" type="number" inputmode="numeric" min="16" max="90" value="' + esc(i.age) + '"></div>' +
      '<div class="field"><label for="tcHeight">Înălțime (cm)</label><input id="tcHeight" type="number" inputmode="numeric" min="130" max="220" value="' + esc(i.height) + '"></div>' +
      '<div class="field"><label for="tcWeight">Greutate (kg)</label><input id="tcWeight" type="number" inputmode="decimal" step="0.1" min="35" max="250" value="' + esc(i.weight) + '"></div></div>' +
      '<div class="field"><label for="tcAct">Activitate</label><select id="tcAct">' + ACT.map(function (o) { return '<option value="' + o[0] + '"' + (i.activity === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Obiectiv</label>' + seg('goal', GOAL, i.goal) + '</div>';
    if (sug) {
      h += '<div class="sug"><div><span>Metabolism bazal</span><b>' + sug.bmr + ' kcal</b></div><div><span>Menținere</span><b>' + sug.maintenance + ' kcal</b></div><div><span>Calculat pentru obiectiv</span><b>' + sug.kcal + ' kcal</b></div>' +
        '<div class="sug-m">' + sug.p + ' g P · ' + sug.c + ' g C · ' + sug.f + ' g G</div></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="usesug">Folosește calculul</button>';
    } else {
      h += '<p class="muted small" style="margin:0">Completează vârsta, înălțimea și greutatea ca să vezi calculul.</p>';
    }
    return h + '</div>';
  }

  function editorHtml() {
    var e = S.ed, h = '<div class="tabs" data-seg="mode">' +
      [['pct', 'Calorii + procente'], ['g', 'Grame'], ['gkg', 'g/kg corp']].map(function (o) { return '<button type="button" data-v="' + o[0] + '" class="' + (e.mode === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (e.mode !== 'g') {
      h += '<div class="field"><label for="teKcal">Calorii pe zi</label><div class="kcal-row"><button type="button" class="btn btn-ghost btn-sm" data-kcal="-100">−100</button><input id="teKcal" type="number" inputmode="numeric" step="10" value="' + esc(e.kcal) + '"><button type="button" class="btn btn-ghost btn-sm" data-kcal="100">+100</button></div></div>';
    }
    if (e.mode === 'pct') {
      h += '<div class="row3">' + [['pp', 'Proteine %'], ['cp', 'Carbohidrați %'], ['fp', 'Grăsimi %']].map(function (x) { return '<div class="field"><label for="te_' + x[0] + '">' + x[1] + '</label><input id="te_' + x[0] + '" data-ed="' + x[0] + '" type="number" inputmode="numeric" min="0" max="100" value="' + esc(e[x[0]]) + '"></div>'; }).join('') + '</div>';
    } else if (e.mode === 'g') {
      h += '<div class="row3">' + [['p', 'Proteine (g)'], ['c', 'Carbohidrați (g)'], ['f', 'Grăsimi (g)']].map(function (x) { return '<div class="field"><label for="te_' + x[0] + '">' + x[1] + '</label><input id="te_' + x[0] + '" data-ed="' + x[0] + '" type="number" inputmode="numeric" min="0" value="' + esc(e[x[0]]) + '"></div>'; }).join('') + '</div>' +
        '<p class="muted small" style="margin:-4px 0 12px">Caloriile se calculează din grame.</p>';
    } else {
      h += '<div class="row3"><div class="field"><label for="te_pkg">Proteine (g/kg)</label><input id="te_pkg" data-ed="pkg" type="number" inputmode="decimal" step="0.1" min="0" max="4" value="' + esc(e.pkg) + '"></div>' +
        '<div class="field"><label for="te_fkg">Grăsimi (g/kg)</label><input id="te_fkg" data-ed="fkg" type="number" inputmode="decimal" step="0.1" min="0" max="3" value="' + esc(e.fkg) + '"></div>' +
        '<div class="field"><label>Carbohidrați</label><input type="text" value="restul" disabled></div></div>';
    }
    return h + '<div id="teOut"></div>';
  }

  function outHtml() {
    var r = compute(), t = r.t, k = t.p * 4 + t.c * 4 + t.f * 9 || 1, w = num(S.inp.weight);
    var h = '<div class="tsum"><div class="t-k"><b>' + t.kcal + '</b><span>kcal</span></div>' +
      '<div class="t-p"><b>' + t.p + ' g</b><span>proteine · ' + R(t.p * 4 / k * 100) + '%' + (w ? ' · ' + dec1(t.p / w) + ' g/kg' : '') + '</span></div>' +
      '<div class="t-c"><b>' + t.c + ' g</b><span>carbo · ' + R(t.c * 4 / k * 100) + '%</span></div>' +
      '<div class="t-f"><b>' + t.f + ' g</b><span>grăsimi · ' + R(t.f * 9 / k * 100) + '%</span></div></div>';
    r.errs.forEach(function (x) { h += '<p class="msg">' + esc(x) + '</p>'; });
    if (!r.errs.length && num(S.inp.age) && num(S.inp.height) && num(S.inp.weight)) {
      var fl = floorFor({ sex: S.inp.sex, age: num(S.inp.age), height: num(S.inp.height), weight: num(S.inp.weight), activity: S.inp.activity, goal: S.inp.goal });
      if (t.kcal < fl.min) h += '<p class="msg msg-warn">Atenție: ' + t.kcal + ' kcal e sub limita minimă recomandată pentru acest client (' + fl.min + ' kcal; metabolismul bazal e ' + fl.bmr + ' kcal). Poți salva, dar decizia și răspunderea sunt ale tale.</p>';
    }
    return h;
  }

  function proposalsHtml() {
    var list = S.proposals.filter(function (x) { return x.status === 'pending'; });
    if (!list.length) return '';
    return '<section class="card card-alert"><h2>Propunere de ajustare</h2>' + list.map(function (x) {
      return '<div class="prop"><p style="margin:0 0 6px"><b>' + (x.change > 0 ? '+' : '') + x.change + ' kcal</b> · ' + App.fmtDate(x.created_on) + (x.from_kg != null ? ' · ' + dec1(+x.from_kg) + ' → ' + dec1(+x.to_kg) + ' kg' : '') + '</p><p class="small muted" style="margin:0 0 10px">' + esc(x.reason) + '</p>' +
        '<div class="row"><button type="button" class="btn btn-sm" data-prop="' + x.id + '" data-to="accepted">Aplică ' + (x.change > 0 ? '+' : '') + x.change + ' kcal</button><button type="button" class="btn btn-ghost btn-sm" data-prop="' + x.id + '" data-to="dismissed">Ignoră</button></div></div>';
    }).join('') + '<p class="small muted" style="margin:10px 0 0">La aplicare, diferența se ia din carbohidrați; proteinele și grăsimile rămân la fel.</p></section>';
  }

  function render() {
    var c = S.client, t = S.targets;
    var lastW = S.weights.length ? S.weights[S.weights.length - 1] : null;
    var h = '<div class="row" style="margin-bottom:4px"><button type="button" class="linkbtn" data-act="back">← Toți clienții</button></div>' +
      '<section class="card"><h1 style="margin-bottom:6px">' + esc(c.full_name) + '</h1>' +
      '<p class="muted small" style="margin:0">Înscris pe ' + App.fmtDate(c.joined_at) + ' · ultima intrare: ' + App.ago(c.last_seen_at) + (lastW ? ' · ultima greutate: ' + dec1(+lastW.weight_kg) + ' kg (' + App.fmtDate(lastW.measured_on) + ')' : '') + (S.ov && S.ov.meals_total >= 3 ? ' · respectă planul: <b>' + R(S.ov.meals_eaten / S.ov.meals_total * 100) + '%</b> din mese în ultimele 7 zile (' + S.ov.meals_eaten + ' din ' + S.ov.meals_total + ')' : '') + '</p>' +
      (t ? '<p class="pill pill-ok">Plan activ: ' + t.kcal + ' kcal · ' + t.p + ' P · ' + t.c + ' C · ' + t.f + ' G <span class="muted">· setat pe ' + App.fmtDate(t.updated_at) + '</span></p>'
         : '<p class="pill pill-warn">' + (S.profile ? 'Clientul așteaptă să-i stabilești caloriile' : 'Clientul nu și-a completat încă datele') + '</p>') +
      '</section>';
    h += proposalsHtml();
    h += '<section class="card"><h2>Preferințele clientului</h2>' + prefsHtml() + '</section>';
    h += '<section class="card"><h2>Calculator</h2><p class="muted small">Precompletat cu datele clientului. Poți schimba orice: calculul de aici e doar un punct de plecare.</p>' + calcHtml() + '</section>';
    h += '<section class="card"><h2>Caloriile și macro-urile clientului</h2>' + editorHtml() +
      '<p id="teMsg" class="msg" hidden></p><button type="button" class="btn btn-block" data-act="save">' + (t ? 'Salvează și refă planul clientului' : 'Salvează și trimite planul') + '</button>' +
      '<p class="muted small" style="margin:10px 0 0">Clientul primește planul pe noile cifre data viitoare când deschide contul.</p></section>';
    $('tcMain').innerHTML = h;
    $('teOut').innerHTML = outHtml();
  }

  function rerenderOut() { var o = $('teOut'); if (o) o.innerHTML = outHtml(); }
  function readInputs() {
    var g = function (id) { var el = $(id); return el ? el.value : ''; };
    S.inp.age = g('tcAge'); S.inp.height = g('tcHeight'); S.inp.weight = g('tcWeight'); S.inp.activity = g('tcAct') || S.inp.activity;
  }

  // ---------------- events ----------------
  function bind() {
    var root = $('vClient');
    root.onclick = async function (e) {
      var t = e.target;
      var sg = t.closest('[data-seg] button');
      if (sg) {
        var name = sg.parentNode.getAttribute('data-seg'), v = sg.getAttribute('data-v');
        if (name === 'mode') { var cur = compute(); fillEditor(cur.errs.length ? S.lastGood || cur.t : cur.t, v); readInputs(); return render(); }
        sg.parentNode.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === sg); });
        readInputs(); S.inp[name] = v; return render();
      }
      var kb = t.closest('[data-kcal]');
      if (kb) { var inp = $('teKcal'); S.ed.kcal = (num(inp.value) || 0) + (+kb.getAttribute('data-kcal')); inp.value = S.ed.kcal; return rerenderOut(); }
      var a = t.closest('[data-act]');
      if (a) {
        var act = a.getAttribute('data-act');
        if (act === 'back') return S.onBack();
        if (act === 'usesug') { readInputs(); var sug = suggestion(); if (sug) { fillEditor({ kcal: sug.kcal, p: sug.p, c: sug.c, f: sug.f }); render(); } return; }
        if (act === 'save') return save(a);
      }
      var pb = t.closest('[data-prop]');
      if (pb) return resolveProposal(+pb.getAttribute('data-prop'), pb.getAttribute('data-to'), pb);
    };
    root.oninput = function (e) {
      var t = e.target;
      if (t.id === 'teKcal') { S.ed.kcal = t.value; return rerenderOut(); }
      var k = t.getAttribute('data-ed');
      if (k) { S.ed[k] = t.value; return rerenderOut(); }
      if (['tcAge', 'tcHeight', 'tcWeight'].indexOf(t.id) >= 0) { readInputs(); rerenderOut(); }
    };
    root.onchange = function (e) {
      if (['tcAge', 'tcHeight', 'tcWeight', 'tcAct'].indexOf(e.target.id) >= 0) { readInputs(); render(); }
    };
  }

  async function save(btn) {
    readInputs();
    var r = compute(), m = $('teMsg');
    if (r.errs.length) { App.msg(m, r.errs[0]); return; }
    btn.disabled = true; App.msg(m, '');
    var row = {
      client_id: S.client.id, kcal: r.t.kcal, p: r.t.p, c: r.t.c, f: r.t.f, set_by: S.me.id, updated_at: new Date().toISOString(),
      calc: { mode: S.ed.mode, input: { sex: S.inp.sex, age: num(S.inp.age), height: num(S.inp.height), weight: num(S.inp.weight), activity: S.inp.activity, goal: S.inp.goal } }
    };
    var res = await sb.from('client_targets').upsert(row, { onConflict: 'client_id' }).select('*').single();
    btn.disabled = false;
    if (res.error) return App.msg(m, App.ro(res.error));
    S.targets = res.data; S.lastGood = r.t;
    if (S.onSaved) S.onSaved(S.client.id, res.data);
    if (window.MenuEditor) MenuEditor.setTargets(res.data);
    render();
    App.msg($('teMsg'), 'Salvat. ' + S.client.full_name.split(/\s+/)[0] + ' primește planul pe ' + res.data.kcal + ' kcal.', 'ok');
  }

  async function resolveProposal(id, to, btn) {
    var x = S.proposals.find(function (p) { return p.id === id; });
    if (!x) return;
    btn.disabled = true;
    if (to === 'accepted') {
      if (!S.targets) { btn.disabled = false; return alertMsg('Setează întâi caloriile clientului, apoi aplică propunerea.'); }
      var t = S.targets, kcal = t.kcal + x.change, c = t.c + x.change / 4, f = t.f;
      if (c < 0) { f = Math.max(0, f + c * 4 / 9); c = 0; }
      var up = await sb.from('client_targets').update({ kcal: kcal, c: Math.round(c), f: Math.round(f), set_by: S.me.id, updated_at: new Date().toISOString() }).eq('client_id', S.client.id).select('*').single();
      if (up.error) { btn.disabled = false; return alertMsg(App.ro(up.error)); }
      S.targets = up.data; fillEditor(up.data);
      if (S.onSaved) S.onSaved(S.client.id, up.data);
      if (window.MenuEditor) MenuEditor.setTargets(up.data);
    }
    var r = await sb.from('target_proposals').update({ status: to }).eq('id', id).select('*').single();
    if (r.error) { btn.disabled = false; return alertMsg(App.ro(r.error)); }
    Object.assign(x, r.data);
    render();
  }
  function alertMsg(t) { var m = $('teMsg'); if (m) App.msg(m, t); }

  async function open(me, client, onBack, onSaved) {
    var root = $('vClient');
    root.innerHTML = '<div class="loading">Se încarcă fișa…</div>';
    var q = await Promise.all([
      sb.from('meal_profiles').select('answers,updated_at').eq('user_id', client.id).maybeSingle(),
      sb.from('client_targets').select('*').eq('client_id', client.id).maybeSingle(),
      sb.from('target_proposals').select('*').eq('client_id', client.id).order('created_on', { ascending: false }).limit(10),
      sb.from('body_weights').select('measured_on,weight_kg').eq('user_id', client.id).order('measured_on', { ascending: true }).limit(400),
      sb.rpc('trainer_overview')
    ]);
    var err = q.find(function (x) { return x.error; });
    if (err) { root.innerHTML = '<div class="card"><p class="msg">' + esc(App.ro(err.error)) + '</p><button class="btn btn-ghost btn-sm" data-act="back">← Înapoi</button></div>'; root.onclick = function (e) { if (e.target.closest('[data-act=back]')) onBack(); }; return; }
    var a = (q[0].data && q[0].data.answers) || {}, t = q[1].data, ws = q[3].data || [];
    var calcIn = t && t.calc && t.calc.input;
    var lastW = ws.length ? +ws[ws.length - 1].weight_kg : null;
    S = {
      me: me, client: client, onBack: onBack, onSaved: onSaved,
      profile: q[0].data, targets: t, proposals: q[2].data || [], weights: ws,
      ov: ((q[4] && q[4].data) || []).find(function (x) { return x.client_id === client.id; }) || null,
      inp: {
        sex: a.sex || (calcIn && calcIn.sex) || 'm',
        age: a.age || (calcIn && calcIn.age) || '',
        height: a.height || (calcIn && calcIn.height) || '',
        weight: lastW || a.weight || (calcIn && calcIn.weight) || '',
        activity: a.activity || (calcIn && calcIn.activity) || 'moderat',
        goal: a.goal || (calcIn && calcIn.goal) || 'slabire'
      }
    };
    if (t) { fillEditor(t, (t.calc && t.calc.mode) || 'pct'); S.lastGood = { kcal: t.kcal, p: t.p, c: t.c, f: t.f }; }
    else { var sug = suggestion(); fillEditor(sug ? { kcal: sug.kcal, p: sug.p, c: sug.c, f: sug.f } : { kcal: 2000, p: 150, c: 200, f: 65 }, 'pct'); }
    root.innerHTML = '<div id="tcMain"></div><div id="tcChat" style="margin-top:16px"></div><div id="tcMenu" style="margin-top:16px"></div><div id="tcEvo" class="stack" style="margin-top:16px"></div>';
    bind(); render();
    MenuEditor.mount($('tcMenu'), { me: me, client: client, targets: t, profile: q[0].data });
    var inactive = me.billing && me.billing.active === false;
    Chat.mount($('tcChat'), { clientId: client.id, asTrainer: true, otherName: client.full_name, readOnly: inactive ? 'Ca să-i scrii clientului, alege un abonament (proba sau abonamentul s-au încheiat).' : null });
    // evoluția: graficul greutății și check-in-urile (se desenează o singură dată)
    $('tcEvo').innerHTML = '<section class="card"><h2>Greutate</h2>' + (ws.length ? App.lineChart(ws.map(function (x) { return { d: x.measured_on, v: +x.weight_kg }; }), 'kg', 'Greutatea clientului') : '<p class="muted small" style="margin:0">Clientul nu și-a notat încă greutatea.</p>') + '</section><div id="tcCk"></div>';
    Checkin.mountTrainer($('tcCk'), client.id);
    window.scrollTo(0, 0);
  }

  window.TrainerClient = { open: open };
})();
