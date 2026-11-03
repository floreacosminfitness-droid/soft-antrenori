// Contul clientului: datele și preferințele, așteptarea țintelor de la antrenor,
// planul pe 7 zile (motorul COS FIT), bifarea meselor, înlocuiri, greutatea.
(function () {
  var App = window.App, G = window.CosfitGen, sb = App.sb, esc = App.esc;
  function $(id) { return document.getElementById(id); }
  function R(n) { return Math.round(n); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function msg(el, t) { App.msg(el, t); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function addDays(s, n) { return new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
  function fmtDate(s) { return App.fmtDate(s + 'T12:00:00Z'); }
  var DAYS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  var DAYS3 = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
  function dayName(s) { return DAYS[new Date(s + 'T12:00:00Z').getUTCDay()]; }
  var EXCL = [
    ['Pește și fructe de mare', function (f) { return f.cat === 'Pește'; }],
    ['Carne de porc', function (f) { return f.id.indexOf('porc') >= 0; }],
    ['Carne de vită', function (f) { return f.id.indexOf('vita') >= 0; }],
    ['Ouă', function (f) { return f.cat === 'Ouă'; }],
    ['Ciuperci', function (f) { return f.id === 'ciuperci' || f.id === 'pleurotus'; }],
    ['Nuci și semințe', function (f) { return f.cat === 'Nuci și semințe'; }],
    ['Leguminoase', function (f) { return f.cat === 'Leguminoase'; }]
  ];

  var MP = { content: null, db: null, food: {}, recipe: {}, profile: null, targets: null, row: null, plan: null, day: 0, open: null, flash: '', banner: '', edit: false, alts: [], weights: [], trainer: null, me: null };
  function fname(id) { return (MP.food[id] ? MP.food[id].name : id).replace(/ \(1 .*?\)$/, ''); }
  function mpQ(seed) { var a = MP.profile.answers; return Object.assign({}, a, { exclude: (a.exclude || []).slice(), seed: seed }); }
  function T0() { var t = MP.targets; return { kcal: t.kcal, p: t.p, c: t.c, f: t.f }; }
  function sameTargets(a, b) { return a && b && a.kcal === b.kcal && a.p === b.p && a.c === b.c && a.f === b.f; }

  // ---------- salvarea planului (format compact, ca la COS FIT) ----------
  function serialize(p) {
    return { warnings: p.warnings || [], checked: p.checked || {}, seedN: p.seedN || 0, days: p.days.map(function (d) {
      return { meals: d.meals.map(function (m) {
        var o = { rid: m.recipe.id, slot: m.slot, type: m.type, share: m.share || null, name: m.name || null, steps: m.steps || null, cook: m.cook || null, swaps: m.swaps || null, target: m.target || null,
          items: m.items.map(function (i) { return [i.id, i.g, i.label || null, i.role]; }) };
        if (m.planItems) o.pi = m.planItems.map(function (i) { return [i.id, i.g, i.label || null, i.role]; });
        if (m.status) o.st = m.status;
        if (m.actual) o.act = m.actual;
        return o;
      }), extra: d.extra && d.extra.length ? d.extra : null };
    }) };
  }
  function hydrate(row) {
    var src = row.plan || {};
    var p = { targets: row.targets, warnings: src.warnings || [], checked: src.checked || {}, seedN: src.seedN || 0, days: (src.days || []).map(function (d) {
      return { meals: d.meals.filter(function (m) { return MP.recipe[m.rid]; }).map(function (m) {
        var meal = { recipe: MP.recipe[m.rid], slot: m.slot, type: m.type, target: m.target, items: m.items.filter(function (i) { return MP.food[i[0]]; }).map(function (i) {
          return { id: i[0], name: fname(i[0]), g: i[1], label: i[2], role: i[3], x: MP.food[i[0]] };
        }) };
        if (m.name) meal.name = m.name; if (m.steps) meal.steps = m.steps; if (m.cook) meal.cook = m.cook; if (m.swaps) meal.swaps = m.swaps; if (m.share) meal.share = m.share;
        if (m.pi) meal.planItems = m.pi.filter(function (i) { return MP.food[i[0]]; }).map(function (i) { return { id: i[0], name: fname(i[0]), g: i[1], label: i[2], role: i[3], x: MP.food[i[0]] }; });
        if (m.st) meal.status = m.st;
        if (m.act) meal.actual = m.act;
        return G.recomputeMeal(meal);
      }), extra: d.extra || [] };
    }) };
    G.refreshPlan(p);
    p.days.forEach(function (d, di) { if (d.extra.length || d.meals.some(function (m) { return m.status; })) G.rebalanceDay(p, di); });
    return p;
  }
  var saveT = null;
  function mpSave() {
    clearTimeout(saveT);
    saveT = setTimeout(async function () {
      if (!MP.row) return;
      var r = await sb.from('meal_plans').update({ plan: serialize(MP.plan), updated_at: new Date().toISOString() }).eq('id', MP.row.id);
      if (r.error) { MP.flash = 'Nu am putut salva ultima modificare. Verifică internetul.'; render(); }
    }, 500);
  }
  async function newPlan(start, seedN) {
    seedN = seedN || 0;
    var plan = G.generate(MP.content, mpQ(start + '#' + seedN), { prepared: MP.db, targets: T0() });
    plan.seedN = seedN; plan.checked = {};
    var r = await sb.from('meal_plans').upsert({ week_start: start, targets: plan.targets, plan: serialize(plan), updated_at: new Date().toISOString() }, { onConflict: 'user_id,week_start' }).select('*').single();
    if (r.error) throw r.error;
    MP.row = r.data; MP.plan = hydrate(r.data);
    MP.day = Math.max(0, Math.min(6, daysBetween(start, today())));
  }

  // ---------- la 2 săptămâni: propunere de ajustare pentru antrenor ----------
  async function checkAdjust() {
    var t = today(), prof = MP.profile;
    var since = prof.last_adjust || prof.plan_start || t;
    if (daysBetween(since, t) < G.CONFIG.adjustEveryDays) return;
    var goal = (MP.targets.calc && MP.targets.calc.input && MP.targets.calc.input.goal) || prof.answers.goal;
    var w = MP.weights.map(function (x) { return { date: x.measured_on, kg: +x.weight_kg }; });
    var res = G.adjust(Object.assign({}, prof.answers, { goal: goal }), w, since, t);
    if (!res.due) return;
    if (res.from == null) {
      MP.banner = 'Cântărește-te de 2–3 ori pe săptămână (mai jos, la Greutate), ca antrenorul să vadă dacă planul merge în direcția bună.';
      return;
    }
    if (res.change) {
      var ins = await sb.from('target_proposals').insert({ change: res.change, reason: res.reason, from_kg: res.from, to_kg: res.to });
      if (ins.error && !/duplicate|unique/i.test(ins.error.message)) return;
      MP.banner = 'Am trimis antrenorului tău o propunere: ' + (res.change > 0 ? '+' : '') + res.change + ' kcal. ' + res.reason + ' Dacă o acceptă, planul se reface singur.';
    } else {
      MP.banner = res.reason;
    }
    var up = await sb.from('meal_profiles').update({ last_adjust: t, updated_at: new Date().toISOString() }).eq('user_id', prof.user_id).select('*').single();
    if (!up.error) MP.profile = up.data;
  }

  async function maintain() {
    var t = today();
    if (!MP.row || daysBetween(MP.row.week_start, t) >= 7) { await newPlan(t); return; }
    if (!sameTargets(MP.row.targets, MP.targets)) {
      var old = MP.row.targets;
      await newPlan(t);
      MP.banner = 'Antrenorul ți-a actualizat planul' + (old ? ': ' + old.kcal + ' → ' + MP.targets.kcal + ' kcal pe zi' : '') + '. Meniul de mai jos e refăcut de azi.';
      return;
    }
    MP.day = Math.max(0, Math.min(6, daysBetween(MP.row.week_start, t)));
  }

  // ---------- încărcare ----------
  async function load() {
    $('mpOut').innerHTML = '<div class="loading">Se încarcă planul…</div>';
    try {
      var q = await Promise.all([
        sb.from('meal_content').select('data').eq('id', 1).single(),
        sb.from('meal_profiles').select('*').maybeSingle(),
        sb.from('client_targets').select('*').maybeSingle(),
        sb.from('body_weights').select('id,measured_on,weight_kg').order('measured_on', { ascending: true }).limit(2000)
      ]);
      var err = q.find(function (x) { return x.error; }); if (err) throw err.error;
      MP.content = q[0].data.data; MP.db = G.prepare(MP.content);
      MP.content.foods.forEach(function (f) { MP.food[f.id] = f; });
      MP.content.recipes.forEach(function (r) { MP.recipe[r.id] = r; });
      MP.profile = q[1].data || null; MP.targets = q[2].data || null; MP.weights = q[3].data || [];
      if (MP.profile && MP.targets) {
        var pl = await sb.from('meal_plans').select('*').order('week_start', { ascending: false }).limit(1);
        if (pl.error) throw pl.error;
        MP.row = (pl.data && pl.data[0]) || null;
        if (MP.row) MP.plan = hydrate(MP.row);
        await maintain();
        await checkAdjust();
      }
    } catch (e) {
      $('mpOut').innerHTML = '<div class="card"><p class="msg">' + esc(App.ro(e)) + '</p><button type="button" class="btn" data-mp="retry">Încearcă din nou</button></div>';
      return;
    }
    render();
  }

  function render() {
    if (reader) { stopCamera(); if (MP.log) MP.log.scanning = false; }
    var el = $('mpOut');
    if (!MP.profile || MP.edit) { el.innerHTML = formHtml(); return; }
    if (!MP.targets) { el.innerHTML = waitHtml() + weightHtml(); return; }
    el.innerHTML = planHtml() + weightHtml();
  }

  // ---------- formular: datele și preferințele ----------
  function seg(name, opts, val) {
    return '<div class="mp-seg" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '" class="' + (String(o[0]) === String(val) ? 'is-on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function opt(list, val) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
  function formHtml() {
    var a = (MP.profile && MP.profile.answers) || {};
    var lastW = MP.weights.length ? MP.weights[MP.weights.length - 1].weight_kg : '';
    var exSet = {}; (a.exclude || []).forEach(function (id) { exSet[id] = 1; });
    var exOn = EXCL.map(function (e) { var ids = MP.content.foods.filter(e[1]).map(function (f) { return f.id; }); return ids.length && ids.every(function (id) { return exSet[id]; }); });
    return '<form class="card" id="mpForm" novalidate><h2>' + (MP.profile ? 'Modifică datele tale' : 'Câteva întrebări pentru planul tău') + '</h2>' +
      (MP.profile ? '' : '<p class="muted small">Le vede și antrenorul tău, ca să-ți stabilească caloriile.</p>') +
      '<div class="field"><label>Sex</label>' + seg('sex', [['m', 'Bărbat'], ['f', 'Femeie']], a.sex || 'm') + '</div>' +
      '<div class="row3"><div class="field"><label for="mpAge">Vârstă (ani)</label><input id="mpAge" type="number" inputmode="numeric" min="16" max="90" value="' + esc(a.age || '') + '" placeholder="ex. 30"></div>' +
      '<div class="field"><label for="mpHeight">Înălțime (cm)</label><input id="mpHeight" type="number" inputmode="numeric" min="130" max="220" value="' + esc(a.height || '') + '" placeholder="ex. 175"></div>' +
      '<div class="field"><label for="mpWeight">Greutate (kg)</label><input id="mpWeight" type="number" inputmode="decimal" min="35" max="250" step="0.1" value="' + esc(lastW || a.weight || '') + '" placeholder="ex. 80"></div></div>' +
      '<div class="field"><label for="mpAct">Cât de activ ești?</label><select id="mpAct">' + opt([['sedentar', 'Sedentar (fără sport)'], ['usor', 'Ușor activ (1–3 antrenamente/săpt.)'], ['moderat', 'Moderat activ (3–5 antrenamente/săpt.)'], ['activ', 'Foarte activ (6–7 antrenamente/săpt.)'], ['foarte_activ', 'Extrem de activ (muncă fizică + sport)']], a.activity || 'moderat') + '</select></div>' +
      '<div class="field"><label>Obiectiv</label>' + seg('goal', [['slabire', 'Slăbire'], ['mentinere', 'Menținere'], ['masa', 'Masă musculară']], a.goal || 'slabire') + '</div>' +
      '<div class="field"><label for="mpDiet">Ce mănânci?</label><select id="mpDiet">' + opt([['clasic', 'De toate (clasic)'], ['vegetarian', 'Vegetarian'], ['fara_lactoza', 'Fără lactoză'], ['vegetarian_fara_lactoza', 'Vegetarian și fără lactoză']], a.diet || 'clasic') + '</select></div>' +
      '<div class="field"><label>Câte mese pe zi?</label>' + seg('meals', [[3, '3 mese'], [4, '3 mese + gustare'], [5, '3 mese + 2 gustări']], a.meals || 4) + '</div>' +
      '<div class="field"><label for="mpMax">Cât timp ai de gătit pe masă?</label><select id="mpMax">' + opt([[0, 'Oricât'], [30, 'Până la 30 de minute'], [20, 'Până la 20 de minute'], [15, 'Până la 15 minute']], a.maxMinutes || 0) + '</select></div>' +
      '<div class="field"><label>Ce nu mănânci? <span class="muted">(opțional)</span></label><div class="mp-seg mp-chips" id="mpExcl">' + EXCL.map(function (e, i) { return '<button type="button" class="mp-chip' + (exOn[i] ? ' is-on' : '') + '" data-x="' + i + '">' + e[0] + '</button>'; }).join('') + '</div></div>' +
      '<label class="check" style="margin:6px 0 14px"><input type="checkbox" id="mpSafe"' + (MP.profile ? ' checked' : '') + '><span>Confirm că nu am o afecțiune pentru care medicul mi-a recomandat o dietă specială (de exemplu diabet, boli de rinichi, sarcină, tulburări de alimentație).</span></label>' +
      (MP.profile && MP.targets ? '<p class="hint">Dacă îți schimbi preferințele, meniul se reface de azi. Caloriile le stabilește în continuare antrenorul tău.</p>' : '') +
      '<p class="msg" id="mpMsg" role="alert" hidden></p>' +
      '<button class="btn btn-block" type="submit">' + (MP.profile ? 'Salvează' : 'Trimite antrenorului') + '</button>' +
      (MP.profile ? '<button type="button" class="linkbtn" data-mp="cancel" style="display:block;margin:12px auto 0">Renunță</button>' : '') +
      '</form>';
  }

  function waitHtml() {
    return '<section class="card wait"><div class="wait-ico" aria-hidden="true">⏳</div><h2>' + esc(MP.trainer.display_name) + ' îți pregătește planul</h2>' +
      '<p class="muted">Ți-am trimis datele antrenorului. Imediat ce îți stabilește caloriile, aici apare planul tău pe 7 zile, cu rețete, gramaje și lista de cumpărături.</p>' +
      '<div class="mp-actions"><button type="button" data-mp="reload">Verifică din nou</button><button type="button" data-mp="edit">Modifică datele mele</button></div></section>';
  }

  // ---------- greutatea ----------
  function weightHtml() {
    var t = today(), ws = MP.weights.slice(-6).reverse();
    var todayW = MP.weights.find(function (x) { return x.measured_on === t; });
    return '<section class="card" id="mpW"><h2>Greutate</h2><p class="muted small">Cântărește-te de 2–3 ori pe săptămână, dimineața, înainte de micul dejun. Antrenorul tău vede evoluția.</p>' +
      '<div class="kcal-row"><input id="mpWkg" type="number" inputmode="decimal" step="0.1" min="30" max="300" placeholder="kg azi" value="' + (todayW ? esc(todayW.weight_kg) : '') + '"><button type="button" class="btn btn-sm" data-w="save">' + (todayW ? 'Actualizează' : 'Salvează') + '</button></div>' +
      '<p class="msg" id="mpWmsg" hidden></p>' +
      (ws.length ? '<ul class="wlist">' + ws.map(function (x) { return '<li><span>' + fmtDate(x.measured_on) + '</span><b>' + String(x.weight_kg).replace('.', ',') + ' kg</b><button type="button" class="linkbtn small" data-wdel="' + x.id + '" aria-label="Șterge">șterge</button></li>'; }).join('') + '</ul>' : '') +
      '</section>';
  }

  // ---------- planul ----------
  function stepsOf(m) { return G.stepsOf(m); }
  function boxHtml(m, mi) {
    var op = MP.open;
    if (!op || op.mi !== mi) return '';
    if (op.t === 'ing') {
      var it = m.items[op.ii], opts = G.ingredientOptions(MP.content, it, mpQ(''), m, op.ii);
      return '<div class="mp-box"><p>Înlocuiește ' + esc(it.name.toLowerCase()) + ' (' + it.g + ' g) cu:</p>' +
        (opts.length ? '<div class="mp-opts">' + opts.map(function (o) { return '<button type="button" class="mp-opt" data-pick="' + o.id + '">' + esc(o.name) + '<small>' + (o.label ? esc(o.label) + ' · ' : '') + o.g + ' g</small></button>'; }).join('') + '</div>' : '<p class="hint">Nu există înlocuitori potriviți. Încearcă „Schimbă masa”.</p>') +
        '<div class="mp-tools"><button type="button" class="danger" data-never="' + it.id + '">Nu mănânc deloc ' + esc(it.name.toLowerCase()) + '</button><button type="button" class="muted" data-mp="close">Renunță</button></div></div>';
    }
    if (op.t === 'meal') {
      MP.alts = G.mealAlternatives(MP.content, MP.plan, MP.day, mi, mpQ(''), { prepared: MP.db });
      return '<div class="mp-box"><p>Alege altă rețetă (cam ' + R(m.macros.kcal) + ' kcal):</p><div class="mp-opts mp-opts--col">' +
        MP.alts.map(function (a, k) { return '<button type="button" class="mp-opt" data-alt="' + k + '"><span>' + esc(a.recipe.name) + '</span><small><span class="k">' + R(a.macros.kcal) + ' kcal</span> · <span class="p">' + R(a.macros.p) + ' P</span> · <span class="c">' + R(a.macros.c) + ' C</span> · <span class="f">' + R(a.macros.f) + ' G</span> · ' + a.recipe.min + ' min</small></button>'; }).join('') +
        '</div><div class="mp-tools"><button type="button" class="muted" data-mp="close">Renunță</button></div></div>';
    }
    return '';
  }
  function todayHtml(d, T) {
    var t = d.today; if (!t) return '';
    var rows = [['Calorii', 'kcal', ''], ['Proteine', 'p', ' g'], ['Carbohidrați', 'c', ' g'], ['Grăsimi', 'f', ' g']];
    return '<div class="card mp-today"><h3 style="margin:0">Azi</h3><div class="mp-meters">' + rows.map(function (r) {
      var tg = T[r[1]] || 1, e = t.eaten[r[1]], pl = t.planned[r[1]], lf = tg - e;
      var ew = Math.min(100, e / tg * 100), rw = Math.max(0, Math.min(100 - ew, pl / tg * 100)), ow = e > tg ? Math.min(100, (e - tg) / tg * 100) : 0;
      return '<div class="mp-meter m-' + r[1] + '"><div class="k">' + r[0] + '</div><div class="v"><b>' + R(e) + '</b> / ' + R(tg) + r[2] + '</div><div class="mp-bar" role="img" aria-label="' + r[0] + ': ' + R(e) + ' din ' + R(tg) + r[2] + ' mâncate"><i class="e" style="width:' + ew + '%"></i><i class="r" style="width:' + rw + '%"></i>' + (ow ? '<i class="o" style="width:' + ow + '%"></i>' : '') + '</div><div class="left' + (lf < 0 ? ' over' : '') + '">' + (lf >= 0 ? 'mai ai ' + R(lf) + r[2] : 'peste cu ' + R(-lf) + r[2]) + '</div></div>';
    }).join('') + '</div><div class="mp-legend"><span>mâncat</span><span class="r">mesele rămase din plan</span></div></div>';
  }
  function nutHtml(m) {
    var pk = m.p * 4, ck = m.c * 4, fk = m.f * 9, tot = pk + ck + fk || 1;
    var pp = R(pk / tot * 100), cp = R(ck / tot * 100), fp = Math.max(0, 100 - pp - cp);
    return '<div class="mp-nut"><div class="n kcal"><b>' + R(m.kcal) + '</b><span>kcal</span></div>' +
      '<div class="n p"><b>' + R(m.p) + ' g</b><span>proteine</span></div><div class="n c"><b>' + R(m.c) + ' g</b><span>carbo</span></div>' +
      '<div class="n f"><b>' + R(m.f) + ' g</b><span>grăsimi</span></div><div class="n fib"><b>' + R(m.fib || 0) + ' g</b><span>fibre</span></div></div>' +
      '<div class="mp-split" role="img" aria-label="Calorii din proteine ' + pp + '%, carbohidrați ' + cp + '%, grăsimi ' + fp + '%"><i class="p" style="width:' + pp + '%"></i><i class="c" style="width:' + cp + '%"></i><i class="f" style="width:' + fp + '%"></i></div>';
  }
  function entriesTotal(list) { return list.reduce(function (a, e) { return { kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f, fib: a.fib + (e.fib || 0) }; }, { kcal: 0, p: 0, c: 0, f: 0, fib: 0 }); }
  function doneMealHtml(m, mi) {
    var st = m.status, at = st === 'other' ? entriesTotal(m.actual || []) : m.macros;
    return '<article class="card mp-meal is-done"><div class="mp-mhead"><div><div class="mp-slot">' + esc(m.slot) + '</div><h3>' + esc(m.name || m.recipe.name) + '</h3></div><span class="mp-badge' + (st === 'skipped' ? ' skip' : st === 'other' ? ' oth' : '') + '">' + (st === 'eaten' ? 'Mâncat ✓' : st === 'skipped' ? 'Sărit' : 'Am mâncat altceva') + '</span></div>' +
      (st === 'other' ? '<ul class="mp-list">' + (m.actual || []).map(function (e) { return '<li><span>' + esc(e.name) + (e.g ? ' · ' + R(e.g) + ' g' : '') + '</span><span>' + R(e.kcal) + ' kcal</span></li>'; }).join('') + '</ul>' : '') +
      (st !== 'skipped' ? '<div style="margin-top:8px">' + nutHtml(at) + '</div>' : '') +
      '<div class="mp-tools"><button type="button" data-undo="' + mi + '">Anulează</button></div></article>';
  }
  function dayFlash(t, T) {
    if (t.over > 0) return 'Azi ai trecut de țintă cu ' + R(t.over) + ' kcal.' + (t.pending ? ' Mesele rămase sunt la minimul recomandat, ca să nu rămâi flămând.' : '') + ' Nu sări peste mese ca să compensezi: o zi peste nu strică progresul, iar mâine planul merge normal.';
    if (!t.pending) return 'Ziua e completă: ' + R(t.eaten.kcal) + ' din ' + T.kcal + ' kcal, ' + R(t.eaten.p) + ' din ' + T.p + ' g proteine.';
    return 'Ai mâncat ' + R(t.eaten.kcal) + ' kcal. Mai ai ' + R(t.left.kcal) + ' kcal și ' + R(Math.max(0, t.left.p)) + ' g proteine, așa că ' + (t.pending === 1 ? 'masa rămasă a fost recalculată.' : 'cele ' + t.pending + ' mese rămase au fost recalculate.');
  }
  function dec(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function logHtml(kind) {
    var L = MP.log, tot = entriesTotal(L.draft);
    var h = '<div class="mp-box mp-log"><p>' + (kind === 'extra' ? 'Ce ai mâncat în plus față de plan?' : 'Ce ai mâncat în loc de masa din plan?') + '</p>' +
      seg('logmode', [['db', 'Caut un aliment'], ['bar', 'Cod de bare'], ['man', 'Scriu valorile']], L.mode);
    if (L.mode === 'db') {
      h += '<div class="field"><label for="mpLq">Aliment sau preparat</label><input id="mpLq" type="search" autocomplete="off" placeholder="ex.: sarmale, mici, pizza, ciorbă" value="' + esc(L.q) + '"></div><div class="mp-res" id="mpLres">' + resultsHtml() + '</div>';
      if (L.pick) h += '<div class="mp-row"><div class="field wide"><label>Ales: ' + esc(fname(L.pick)) + ' <span class="muted">(' + R(MP.food[L.pick].kcal) + ' kcal la 100 g)</span></label></div><div class="field"><label for="mpLg">Grame</label><input id="mpLg" type="number" inputmode="numeric" min="1" max="3000" value="' + L.g + '"></div><button type="button" class="btn btn-sm" data-logadd="db">Adaugă</button></div>';
    } else if (L.mode === 'bar') {
      h += barcodeHtml();
    } else {
      h += '<div class="field"><label for="mpMn">Ce ai mâncat</label><input id="mpMn" type="text" placeholder="ex.: Paste carbonara la restaurant"></div>' +
        '<div class="mp-row"><div class="field"><label for="mpMk">kcal</label><input id="mpMk" type="number" inputmode="numeric" min="0" max="5000"></div><div class="field"><label for="mpMp">Proteine g</label><input id="mpMp" type="number" inputmode="decimal" min="0"></div><div class="field"><label for="mpMc">Carbo g</label><input id="mpMc" type="number" inputmode="decimal" min="0"></div><div class="field"><label for="mpMf">Grăsimi g</label><input id="mpMf" type="number" inputmode="decimal" min="0"></div></div>' +
        '<p class="hint">Dacă știi doar caloriile, le împart ca la o masă obișnuită (25% proteine, 45% carbohidrați, 30% grăsimi).</p><div class="mp-row"><button type="button" class="btn btn-sm" data-logadd="man">Adaugă</button></div>';
    }
    h += '<p class="msg" id="mpLerr" role="alert" hidden></p>';
    if (L.draft.length) h += '<ul class="mp-list">' + L.draft.map(function (e, k) { return '<li><span>' + esc(e.name) + (e.g ? ' · ' + R(e.g) + ' g' : '') + (e.estimated ? ' <em>(macro estimate)</em>' : '') + '</span><span>' + R(e.kcal) + ' kcal <button type="button" class="linkbtn" data-logdel="' + k + '" aria-label="Scoate ' + esc(e.name) + '">×</button></span></li>'; }).join('') + '</ul>' +
      '<div class="mp-row" style="justify-content:space-between;align-items:center"><span class="hint" style="margin:0">Total: ' + R(tot.kcal) + ' kcal · ' + R(tot.p) + ' P · ' + R(tot.c) + ' C · ' + R(tot.f) + ' G</span><button type="button" class="btn btn-sm" data-logsave="1">Salvează</button></div>';
    return h + '<div class="mp-tools"><button type="button" class="muted" data-mp="close">Renunță</button></div></div>';
  }
  function resultsHtml() {
    var L = MP.log; if (!L || L.q.trim().length < 2) return '';
    var r = G.searchFoods(MP.content, L.q, 8);
    return r.length ? r.map(function (f) { return '<button type="button" class="mp-opt' + (L.pick === f.id ? ' is-on' : '') + '" data-logpick="' + f.id + '"><span>' + esc(fname(f.id)) + '</span><small>' + R(f.kcal) + ' kcal / 100 g' + (f.tier === 'o' ? ' · ocazional' : '') + '</small></button>'; }).join('') : '<p class="hint">Nu am găsit. Încearcă alt cuvânt, codul de bare sau „Scriu valorile”.</p>';
  }

  // ---- cod de bare ----
  var ZX_SRC = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js', zxLoading = null, reader = null;
  function loadZX() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!zxLoading) zxLoading = new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = ZX_SRC; sc.onload = function () { ok(window.ZXing); }; sc.onerror = function () { zxLoading = null; no(new Error('zxing')); }; document.head.appendChild(sc); });
    return zxLoading;
  }
  function makeReader(Z, still) {
    var hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    if (still) hints.set(Z.DecodeHintType.TRY_HARDER, true);
    return new Z.BrowserMultiFormatReader(hints);
  }
  function stopCamera() { if (reader) { try { reader.reset(); } catch (e) {} reader = null; } }
  function validCode(c) {
    if (!/^\d{8}$|^\d{12,14}$/.test(c)) return false;
    var d = c.split('').map(Number), chk = d.pop(), s = 0;
    d.reverse().forEach(function (x, i) { s += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - s % 10) % 10 === chk;
  }
  async function lookupCode(code) {
    try { var own = await sb.from('food_products').select('code,name,kcal,p,c,f,fib').eq('code', code).maybeSingle(); if (own.data) return { status: 'found', prod: own.data, source: 'own' }; } catch (e) {}
    try {
      var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 8000);
      var r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + code + '.json?fields=code,product_name,product_name_ro,generic_name,brands,quantity,serving_quantity,nutriments', { signal: ctl.signal });
      clearTimeout(tm);
      if (r.status === 404) return { status: 'missing' };
      if (!r.ok) return { status: 'offline' };
      var j = await r.json();
      if (j.status !== 1 || !j.product) return { status: 'missing' };
      var p = j.product, n = p.nutriments || {};
      var kcal = num(n['energy-kcal_100g']);
      if (kcal == null && num(n.energy_100g) != null) kcal = num(n.energy_100g) / 4.184;
      var name = String(p.product_name_ro || p.product_name || p.generic_name || '').trim(), brand = String(p.brands || '').split(',')[0].trim();
      if (kcal == null) return { status: 'nonutri', name: name, brand: brand };
      return { status: 'found', source: 'off', prod: { code: code, name: name || ('Produs ' + code), brand: brand, kcal: kcal, p: num(n.proteins_100g) || 0, c: num(n.carbohydrates_100g) || 0, f: num(n.fat_100g) || 0, fib: num(n.fiber_100g) || 0, serving: num(p.serving_quantity) } };
    } catch (e) { return { status: 'offline' }; }
  }
  async function gotCode(code) {
    stopCamera();
    var L = MP.log; L.code = code; L.prod = null; L.miss = null; L.scanning = false;
    if (!validCode(code)) { L.msg = { t: 'Codul ' + code + ' nu pare un cod de bare valid. Verifică cifrele.', err: true }; return render(); }
    L.msg = { t: 'Caut produsul ' + code + '…' }; render();
    var res = await lookupCode(code);
    if (MP.log !== L) return;
    if (res.status === 'found') { L.prod = res.prod; L.g = res.prod.serving && res.prod.serving < 1000 ? Math.round(res.prod.serving) : 100; L.msg = { t: res.source === 'own' ? 'Produs găsit în produsele adăugate de alți clienți.' : 'Produs găsit în Open Food Facts.' }; }
    else {
      L.miss = { name: res.name ? (res.brand ? res.name + ' ' + res.brand : res.name) : '' };
      L.msg = { t: res.status === 'nonutri' ? 'Produsul există, dar nu are valori nutriționale. Scrie-le de pe etichetă, o singură dată.' : res.status === 'missing' ? 'Produsul nu e încă în bază. Scrie valorile de pe etichetă (la 100 g); data viitoare îl găsești direct.' : 'Nu pot accesa acum baza de produse. Verifică internetul sau scrie valorile de pe etichetă.', err: res.status === 'offline' };
    }
    render();
    setTimeout(function () { var g = $('mpBg') || $('mpPn'); if (g) { g.focus(); if (g.select) g.select(); } });
  }
  function barcodeHtml() {
    var L = MP.log;
    var h = '<div class="mp-row"><button type="button" class="btn btn-sm" data-scan="cam">' + (L.scanning ? 'Se pornește camera…' : 'Scanează cu camera') + '</button><label class="btn btn-ghost btn-sm" for="mpScanImg">Fă o poză la cod<input id="mpScanImg" type="file" accept="image/*" capture="environment" hidden></label></div>' +
      '<div id="mpScanView"></div>' +
      '<div class="mp-row"><div class="field wide"><label for="mpCode">sau scrie cifrele de sub bare</label><input id="mpCode" type="text" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="ex.: 5941234567890" value="' + esc(L.code || '') + '"></div><button type="button" class="btn btn-ghost btn-sm" data-lookup="1">Caută</button></div>' +
      (L.msg ? '<p class="hint' + (L.msg.err ? ' err' : '') + '" role="status">' + esc(L.msg.t) + '</p>' : '');
    if (L.prod) {
      var p = L.prod;
      h += '<div class="mp-prod"><b>' + esc(p.name) + (p.brand ? ' · ' + esc(p.brand) : '') + '</b><span class="hint">La 100 g: ' + R(p.kcal) + ' kcal · ' + dec(p.p) + ' g proteine · ' + dec(p.c) + ' g carbo · ' + dec(p.f) + ' g grăsimi</span>' +
        '<div class="mp-row"><div class="field"><label for="mpBg">Câte grame ai mâncat?</label><input id="mpBg" type="number" inputmode="numeric" min="1" max="3000" value="' + L.g + '"></div><button type="button" class="btn btn-sm" data-logadd="bar">Adaugă</button></div>' +
        (p.serving ? '<span class="hint">O porție pe ambalaj: ' + R(p.serving) + ' g.</span>' : '') + '</div>';
    } else if (L.miss) {
      h += '<div class="mp-prod"><b>Valorile de pe etichetă, la 100 g</b><div class="field"><label for="mpPn">Numele produsului</label><input id="mpPn" type="text" value="' + esc(L.miss.name) + '" placeholder="ex.: Iaurt grecesc 2%"></div>' +
        '<div class="mp-row"><div class="field"><label for="mpPk">kcal</label><input id="mpPk" type="number" inputmode="decimal" min="0" max="950"></div><div class="field"><label for="mpPp">Proteine</label><input id="mpPp" type="number" inputmode="decimal" min="0" max="100"></div><div class="field"><label for="mpPc">Carbo</label><input id="mpPc" type="number" inputmode="decimal" min="0" max="100"></div><div class="field"><label for="mpPf">Grăsimi</label><input id="mpPf" type="number" inputmode="decimal" min="0" max="100"></div></div>' +
        '<div class="mp-row"><div class="field"><label for="mpPg">Câte grame ai mâncat?</label><input id="mpPg" type="number" inputmode="numeric" min="1" max="3000" value="100"></div><button type="button" class="btn btn-sm" data-logadd="newprod">Salvează produsul și adaugă</button></div></div>';
    }
    return h;
  }
  async function startCamera() {
    var L = MP.log;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { L.msg = { t: 'Camera nu e disponibilă pe acest dispozitiv. Fă o poză la cod sau scrie cifrele.', err: true }; return render(); }
    L.scanning = true; L.msg = null; render();
    try {
      var Z = await loadZX(); stopCamera(); reader = makeReader(Z);
      $('mpScanView').innerHTML = '<div class="mp-scan"><video id="mpScanVid" playsinline muted></video><div class="aim"></div><button type="button" class="btn btn-ghost btn-sm" data-scanstop="1">Oprește</button></div><p class="hint">Ține codul de bare în chenar, la 10–20 cm de cameră.</p>';
      var btn = document.querySelector('[data-scan="cam"]'); if (btn) btn.textContent = 'Scanează cu camera';
      await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, $('mpScanVid'), function (res) { if (res && reader) gotCode(res.getText()); });
    } catch (e) {
      stopCamera(); L.scanning = false;
      L.msg = { t: e && e.name === 'NotAllowedError' ? 'Nu ai dat voie la cameră. Permite camera din setările browserului, fă o poză la cod sau scrie cifrele.' : e && e.message === 'zxing' ? 'Nu am putut încărca cititorul de coduri. Verifică internetul.' : 'Nu am putut porni camera. Fă o poză la cod sau scrie cifrele.', err: true };
      render();
    }
  }
  async function decodeFile(file) {
    var L = MP.log; L.msg = { t: 'Citesc codul din poză…' }; L.prod = null; L.miss = null; render();
    var url = URL.createObjectURL(file);
    try { var Z = await loadZX(); var r = await makeReader(Z, true).decodeFromImageUrl(url); gotCode(r.getText()); }
    catch (e) { L.msg = { t: e && e.message === 'zxing' ? 'Nu am putut încărca cititorul de coduri. Verifică internetul.' : 'Nu am găsit un cod de bare în poză. Fă poza mai de aproape, drept și cu lumină bună, sau scrie cifrele.', err: true }; render(); }
    finally { setTimeout(function () { URL.revokeObjectURL(url); }, 2000); }
  }
  function dayDone(t) { MP.flash = dayFlash(t, MP.plan.targets); MP.open = null; stopCamera(); mpSave(); render(); }

  function planHtml() {
    var p = MP.plan, T = p.targets, prof = MP.profile, t = today();
    var h = '<div class="mp-tiles"><div class="mp-tile t-kcal"><b>' + T.kcal + '</b><span>kcal pe zi</span></div><div class="mp-tile t-p"><b>' + T.p + ' g</b><span>proteine</span></div><div class="mp-tile t-c"><b>' + T.c + ' g</b><span>carbohidrați</span></div><div class="mp-tile t-f"><b>' + T.f + ' g</b><span>grăsimi</span></div></div>';
    h += '<p class="hint">Caloriile și macro-urile sunt stabilite de ' + esc(MP.trainer.display_name) + '. Meniul se reface singur în fiecare săptămână.</p>';
    if (MP.banner) h += '<div class="mp-banner">' + esc(MP.banner) + '</div>';
    (p.warnings || []).forEach(function (w) { h += '<div class="mp-warn">' + esc(w) + '</div>'; });
    if (MP.flash) { h += '<div class="mp-banner">' + esc(MP.flash) + '</div>'; MP.flash = ''; }
    h += '<div class="mp-days" role="tablist">';
    for (var i = 0; i < 7; i++) { var ds = addDays(MP.row.week_start, i); h += '<button type="button" role="tab" data-day="' + i + '" class="' + (MP.day === i ? 'is-on' : '') + (ds === t ? ' today' : '') + '">' + DAYS3[new Date(ds + 'T12:00:00Z').getUTCDay()] + '<small>' + fmtDate(ds).replace(/ \d{4}$/, '') + '</small></button>'; }
    h += '<button type="button" role="tab" data-day="shop" class="' + (MP.day === 'shop' ? 'is-on' : '') + '">Cumpărături<small>săptămâna</small></button></div>';
    if (MP.day === 'shop') {
      h += '<div class="card mp-shop">' + p.shopping.map(function (c) {
        return '<h4>' + esc(c.cat) + '</h4>' + c.items.map(function (i) { var on = !!p.checked[i.id]; return '<label class="' + (on ? 'done' : '') + '"><input type="checkbox" data-chk="' + i.id + '"' + (on ? ' checked' : '') + '><span>' + esc(i.name) + '</span><em>' + (i.g >= 1000 ? (i.g / 1000).toFixed(2).replace('.', ',') + ' kg' : i.g + ' g') + '</em></label>'; }).join('');
      }).join('') + '</div>';
    } else {
      var d = p.days[MP.day];
      h += '<h2 class="mp-dayname">' + dayName(addDays(MP.row.week_start, MP.day)) + '</h2>';
      h += todayHtml(d, T);
      d.meals.forEach(function (m, mi) {
        var op = MP.open;
        if (m.status) { h += doneMealHtml(m, mi); return; }
        h += '<article class="card mp-meal"><div class="mp-mhead"><div><div class="mp-slot">' + esc(m.slot) + ' · ' + m.recipe.min + ' min</div><h3>' + esc(m.name || m.recipe.name) + '</h3>' + (m.changed ? '<div class="mp-recalc">Recalculată: ' + (m.changed > 0 ? '+' : '−') + R(Math.abs(m.changed)) + ' kcal față de plan</div>' : '') + '</div></div>' + nutHtml(m.macros) +
          '<ul class="mp-ing">' + m.items.map(function (it, ii) { var on = op && op.t === 'ing' && op.mi === mi && op.ii === ii; return '<li><button type="button" data-ing="' + mi + ':' + ii + '" class="' + (on ? 'is-on' : '') + '" aria-expanded="' + !!on + '"><span>' + esc(it.name) + '</span><span>' + (it.label ? esc(it.label) + ' · ' : '') + it.g + ' g</span></button></li>'; }).join('') + '</ul>' +
          (m.swaps ? '<p class="mp-swapped">Înlocuit: ' + m.swaps.map(esc).join(', ') + '</p>' : '') +
          boxHtml(m, mi) +
          (op && op.t === 'other' && op.mi === mi ? logHtml('other') : '<div class="mp-eat"><button type="button" class="main" data-eat="' + mi + '">Am mâncat</button><button type="button" data-other="' + mi + '">Am mâncat altceva</button><button type="button" data-skip="' + mi + '">Sar peste</button></div>') +
          '<div class="mp-tools"><button type="button" data-alts="' + mi + '">' + (op && op.t === 'meal' && op.mi === mi ? 'Închide' : 'Schimbă masa') + '</button></div>' +
          '<details><summary>Cum se prepară</summary><ol>' + stepsOf(m).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' + (m.recipe.cond ? '<p class="mp-cond">Condimente: ' + esc(m.recipe.cond) + '</p>' : '') + '</details></article>';
      });
      (d.extra || []).forEach(function (e, k) { h += '<div class="card mp-meal is-done"><div class="mp-mhead"><div><div class="mp-slot">În plus</div><h3>' + esc(e.name) + (e.g ? ' · ' + R(e.g) + ' g' : '') + '</h3></div></div>' + nutHtml(e) + '<div class="mp-tools"><button type="button" class="danger" data-xdel="' + k + '">Scoate</button></div></div>'; });
      h += MP.open && MP.open.t === 'extra' ? '<div class="card mp-meal">' + logHtml('extra') + '</div>' : '<div class="mp-eat mp-extra"><button type="button" data-extra="1">+ Am mâncat ceva în plus</button></div>';
      h += '<p class="hint">Apasă pe un ingredient ca să-l înlocuiești. Bifează mesele pe măsură ce le mănânci: dacă mănânci altceva, mesele rămase se recalculează pe ce mai ai de mâncat. Gramajele sunt pentru alimentele crude, dacă nu scrie altfel.</p>';
    }
    var ex = (prof.answers.exclude || []);
    h += '<div class="mp-actions"><button type="button" data-mp="again">Alt meniu pentru săptămâna asta</button><button type="button" data-mp="edit">Modifică preferințele</button></div>';
    if (ex.length) h += '<p class="hint" style="margin-top:14px">Nu mănânci: ' + ex.map(function (id) { return esc(fname(id).toLowerCase()); }).join(', ') + '. Poți schimba asta din „Modifică preferințele”.</p>';
    return h;
  }

  // ---------- evenimente ----------
  function bind() {
    var out = $('mpOut');
    out.addEventListener('click', async function (e) {
      var t = e.target;
      var sg = t.closest('[data-seg]:not([data-seg="logmode"]) button');
      if (sg) { sg.parentNode.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b === sg); }); return; }
      var xc = t.closest('#mpExcl .mp-chip'); if (xc) { xc.classList.toggle('is-on'); return; }
      var lm = t.closest('[data-seg="logmode"] button');
      if (lm) { stopCamera(); MP.log.mode = lm.getAttribute('data-v'); MP.log.scanning = false; return render(); }
      var wb = t.closest('[data-w]'); if (wb) return saveWeight(wb);
      var wd = t.closest('[data-wdel]'); if (wd) return delWeight(+wd.getAttribute('data-wdel'));
      var di = MP.day;
      var eb = t.closest('[data-eat]'); if (eb) return dayDone(G.markMeal(MP.plan, di, +eb.getAttribute('data-eat'), 'eaten'));
      var skb = t.closest('[data-skip]'); if (skb) return dayDone(G.markMeal(MP.plan, di, +skb.getAttribute('data-skip'), 'skipped'));
      var ub = t.closest('[data-undo]'); if (ub) return dayDone(G.markMeal(MP.plan, di, +ub.getAttribute('data-undo'), null));
      var xd = t.closest('[data-xdel]'); if (xd) return dayDone(G.removeExtra(MP.plan, di, +xd.getAttribute('data-xdel')));
      var ob = t.closest('[data-other]');
      if (ob) { MP.open = { t: 'other', mi: +ob.getAttribute('data-other') }; MP.log = { mode: 'db', q: '', pick: null, g: 250, draft: [] }; render(); setTimeout(function () { var i = $('mpLq'); if (i) i.focus(); }); return; }
      if (t.closest('[data-extra]')) { MP.open = { t: 'extra' }; MP.log = { mode: 'db', q: '', pick: null, g: 100, draft: [] }; render(); setTimeout(function () { var i = $('mpLq'); if (i) i.focus(); }); return; }
      var lp = t.closest('[data-logpick]'); if (lp) { MP.log.pick = lp.getAttribute('data-logpick'); render(); setTimeout(function () { var g = $('mpLg'); if (g) { g.focus(); g.select(); } }); return; }
      if (t.closest('[data-scan]')) return startCamera();
      if (t.closest('[data-scanstop]')) { stopCamera(); MP.log.scanning = false; return render(); }
      if (t.closest('[data-lookup]')) { var cd = ($('mpCode').value || '').replace(/\D/g, ''); if (cd) gotCode(cd); else { MP.log.msg = { t: 'Scrie cifrele de sub codul de bare.', err: true }; render(); } return; }
      var la = t.closest('[data-logadd]');
      if (la) {
        var er = $('mpLerr'), kind = la.getAttribute('data-logadd'), L = MP.log, g;
        if (kind === 'db') {
          g = num($('mpLg').value); if (!(g > 0 && g <= 3000)) return msg(er, 'Scrie câte grame ai mâncat (între 1 și 3000).');
          L.draft.push(G.foodEntry(MP.food[L.pick], g)); L.pick = null; L.q = '';
        } else if (kind === 'bar') {
          g = num($('mpBg').value); if (!(g > 0 && g <= 3000)) return msg(er, 'Scrie câte grame ai mâncat (între 1 și 3000).');
          L.draft.push(G.per100Entry(L.prod.name + (L.prod.brand ? ' · ' + L.prod.brand : ''), L.prod, g, 'cod de bare')); L.prod = null; L.code = ''; L.msg = null;
        } else if (kind === 'newprod') {
          var v = { code: L.code, name: $('mpPn').value.trim(), kcal: num($('mpPk').value), p: num($('mpPp').value) || 0, c: num($('mpPc').value) || 0, f: num($('mpPf').value) || 0, fib: 0 };
          g = num($('mpPg').value);
          if (!v.name) return msg(er, 'Scrie numele produsului.');
          if (!(v.kcal > 0 && v.kcal <= 950)) return msg(er, 'Scrie caloriile la 100 g, de pe etichetă (între 1 și 950).');
          if (v.p + v.c + v.f > 100) return msg(er, 'Proteinele, carbohidrații și grăsimile la 100 g nu pot depăși împreună 100 g. Verifică eticheta.');
          if (!(g > 0 && g <= 3000)) return msg(er, 'Scrie câte grame ai mâncat (între 1 și 3000).');
          var ins = await sb.from('food_products').insert({ code: v.code, name: v.name.slice(0, 120), kcal: v.kcal, p: v.p, c: v.c, f: v.f, fib: 0 });
          L.draft.push(G.per100Entry(v.name, v, g, 'cod de bare'));
          L.miss = null; L.code = '';
          L.msg = { t: ins.error ? 'Am adăugat produsul azi, dar nu l-am putut salva pentru data viitoare.' : 'Produsul a fost salvat. Data viitoare îl găsești direct după cod.' };
        } else {
          var k = num($('mpMk').value); if (!(k > 0 && k <= 5000)) return msg(er, 'Scrie caloriile (între 1 și 5000 kcal).');
          L.draft.push(G.manualEntry(($('mpMn').value || '').trim().slice(0, 120) || 'Altceva', k, $('mpMp').value, $('mpMc').value, $('mpMf').value));
        }
        return render();
      }
      var ld = t.closest('[data-logdel]'); if (ld) { MP.log.draft.splice(+ld.getAttribute('data-logdel'), 1); return render(); }
      if (t.closest('[data-logsave]')) {
        var o3 = MP.open, list = MP.log.draft.slice();
        if (o3.t === 'other') return dayDone(G.markMeal(MP.plan, di, o3.mi, 'other', list));
        var tt; list.forEach(function (x) { tt = G.addExtra(MP.plan, di, x); }); return dayDone(tt);
      }
      var b = t.closest('[data-mp]');
      if (b) {
        var a = b.getAttribute('data-mp');
        if (a === 'retry' || a === 'reload') return load();
        if (a === 'cancel') { MP.edit = false; return render(); }
        if (a === 'edit') { MP.edit = true; MP.open = null; render(); window.scrollTo(0, 0); return; }
        if (a === 'close') { stopCamera(); MP.open = null; return render(); }
        if (a === 'again') {
          b.disabled = true;
          try { await newPlan(MP.row.week_start, (MP.plan.seedN || 0) + 1); MP.flash = 'Gata, ai un meniu nou pentru săptămâna asta, pe aceleași calorii.'; } catch (err) { MP.flash = 'Nu am putut face un meniu nou. Încearcă din nou.'; }
          MP.open = null; return render();
        }
      }
      var dy = t.closest('[data-day]');
      if (dy) { stopCamera(); var vv = dy.getAttribute('data-day'); MP.day = vv === 'shop' ? 'shop' : +vv; MP.open = null; return render(); }
      var ib = t.closest('[data-ing]');
      if (ib) { var pr = ib.getAttribute('data-ing').split(':').map(Number), o = MP.open; MP.open = (o && o.t === 'ing' && o.mi === pr[0] && o.ii === pr[1]) ? null : { t: 'ing', mi: pr[0], ii: pr[1] }; return render(); }
      var ab = t.closest('[data-alts]');
      if (ab) { var mi = +ab.getAttribute('data-alts'), o2 = MP.open; MP.open = (o2 && o2.t === 'meal' && o2.mi === mi) ? null : { t: 'meal', mi: mi }; return render(); }
      var pk = t.closest('[data-pick]');
      if (pk) {
        var op = MP.open, it = MP.plan.days[MP.day].meals[op.mi].items[op.ii];
        G.swapIngredient(MP.content, MP.plan, MP.day, op.mi, op.ii, pk.getAttribute('data-pick'));
        if (MP.plan.days[MP.day].today) G.rebalanceDay(MP.plan, MP.day);
        MP.flash = it.name + ' a fost înlocuit cu ' + fname(pk.getAttribute('data-pick')).toLowerCase() + '. Gramajul, rețeta și lista de cumpărături s-au actualizat.';
        MP.open = null; mpSave(); return render();
      }
      var al = t.closest('[data-alt]');
      if (al) {
        var op2 = MP.open, old = MP.plan.days[MP.day].meals[op2.mi], nw = MP.alts[+al.getAttribute('data-alt')];
        G.replaceMeal(MP.plan, MP.day, op2.mi, nw);
        if (MP.plan.days[MP.day].today) G.rebalanceDay(MP.plan, MP.day);
        MP.flash = '„' + (old.name || old.recipe.name) + '” a fost înlocuită cu „' + nw.recipe.name + '”.';
        MP.open = null; mpSave(); return render();
      }
      var nv = t.closest('[data-never]');
      if (nv) {
        var id = nv.getAttribute('data-never'), q = mpQ('');
        var n = G.excludeFood(MP.content, MP.plan, q, id, { prepared: MP.db });
        var ans = Object.assign({}, MP.profile.answers, { exclude: q.exclude });
        var up = await sb.from('meal_profiles').update({ answers: ans, updated_at: new Date().toISOString() }).eq('user_id', MP.profile.user_id).select('*').single();
        if (!up.error) MP.profile = up.data;
        MP.flash = 'Am scos ' + fname(id).toLowerCase() + ' din planul tău și am înlocuit ' + n + (n === 1 ? ' masă' : ' mese') + ' din săptămână. Nu va mai apărea nici în planurile următoare.';
        MP.open = null; mpSave(); return render();
      }
    });
    out.addEventListener('input', function (e) {
      if (e.target.id === 'mpLq') { MP.log.q = e.target.value; var r = $('mpLres'); if (r) r.innerHTML = resultsHtml(); }
      if (e.target.id === 'mpLg') MP.log.g = num(e.target.value) || MP.log.g;
    });
    out.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (e.target.id === 'mpCode') { e.preventDefault(); var lb = document.querySelector('[data-lookup]'); if (lb) lb.click(); return; }
      if (e.target.id === 'mpWkg') { e.preventDefault(); var wb = document.querySelector('[data-w]'); if (wb) wb.click(); return; }
      if (['mpLg', 'mpBg', 'mpPn', 'mpPk', 'mpPp', 'mpPc', 'mpPf', 'mpPg', 'mpMn', 'mpMk', 'mpMp', 'mpMc', 'mpMf'].indexOf(e.target.id) >= 0) { e.preventDefault(); var ab2 = document.querySelector('[data-logadd]'); if (ab2) ab2.click(); }
    });
    out.addEventListener('change', function (e) {
      if (e.target.id === 'mpScanImg' && e.target.files && e.target.files[0]) return decodeFile(e.target.files[0]);
      var c = e.target.closest('[data-chk]'); if (!c) return;
      var id = c.getAttribute('data-chk');
      if (c.checked) MP.plan.checked[id] = true; else delete MP.plan.checked[id];
      c.closest('label').classList.toggle('done', c.checked);
      mpSave();
    });
    out.addEventListener('submit', async function (e) {
      if (e.target.id !== 'mpForm') return;
      e.preventDefault();
      var f = e.target, m = $('mpMsg');
      var segv = function (n) { var on = f.querySelector('[data-seg="' + n + '"] .is-on'); return on ? on.getAttribute('data-v') : null; };
      var age = num($('mpAge').value), height = num($('mpHeight').value), weight = num($('mpWeight').value);
      if (!(age >= 16 && age <= 90)) return msg(m, 'Scrie vârsta (între 16 și 90 de ani).');
      if (!(height >= 130 && height <= 220)) return msg(m, 'Scrie înălțimea în centimetri (de exemplu 175).');
      if (!(weight >= 35 && weight <= 250)) return msg(m, 'Scrie greutatea în kilograme (de exemplu 80).');
      if (!$('mpSafe').checked) return msg(m, 'Dacă ai o afecțiune pentru care medicul ți-a recomandat o dietă, planul automat nu e potrivit. Vorbește cu medicul și cu antrenorul tău.');
      var exclude = [];
      f.querySelectorAll('#mpExcl .mp-chip.is-on').forEach(function (c) { var e2 = EXCL[+c.getAttribute('data-x')]; MP.content.foods.forEach(function (fd) { if (e2[1](fd) && exclude.indexOf(fd.id) < 0) exclude.push(fd.id); }); });
      var groupIds = {}; EXCL.forEach(function (e2) { MP.content.foods.forEach(function (fd) { if (e2[1](fd)) groupIds[fd.id] = 1; }); });
      ((MP.profile && MP.profile.answers.exclude) || []).forEach(function (id) { if (!groupIds[id] && exclude.indexOf(id) < 0) exclude.push(id); });
      var answers = { sex: segv('sex'), age: age, height: height, weight: weight, activity: $('mpAct').value, goal: segv('goal'), diet: $('mpDiet').value, meals: +segv('meals'), maxMinutes: +$('mpMax').value || 0, exclude: exclude };
      var btn = f.querySelector('button[type=submit]'); btn.disabled = true; msg(m, '');
      var t = today();
      var row = { answers: answers, updated_at: new Date().toISOString() };
      if (!MP.profile) { row.plan_start = t; row.history = []; }
      var r = await sb.from('meal_profiles').upsert(row, { onConflict: 'user_id' }).select('*').single();
      if (r.error) { btn.disabled = false; return msg(m, 'Nu am putut salva. Verifică internetul și încearcă din nou.'); }
      var prefsChanged = !MP.profile || ['diet', 'meals', 'maxMinutes'].some(function (k) { return String(MP.profile.answers[k]) !== String(answers[k]); }) || JSON.stringify(MP.profile.answers.exclude || []) !== JSON.stringify(exclude);
      MP.profile = r.data;
      var lastW = MP.weights.length ? +MP.weights[MP.weights.length - 1].weight_kg : null;
      if (weight !== lastW) await upsertWeight(t, weight);
      if (MP.targets && (prefsChanged || !MP.row)) {
        try { await newPlan(t); MP.flash = 'Meniul a fost refăcut după preferințele noi.'; } catch (err) { btn.disabled = false; return msg(m, 'Nu am putut reface planul. Încearcă din nou.'); }
      }
      MP.edit = false; MP.open = null;
      render(); window.scrollTo(0, 0);
    });
  }

  async function upsertWeight(d, kg) {
    var r = await sb.from('body_weights').upsert({ measured_on: d, weight_kg: Math.round(kg * 10) / 10 }, { onConflict: 'user_id,measured_on' }).select('id,measured_on,weight_kg').single();
    if (r.error) return r.error;
    MP.weights = MP.weights.filter(function (x) { return x.measured_on !== d; }).concat([r.data]).sort(function (a, b) { return a.measured_on < b.measured_on ? -1 : 1; });
    return null;
  }
  async function saveWeight(btn) {
    var v = num($('mpWkg').value), m = $('mpWmsg');
    if (!(v >= 30 && v <= 300)) return msg(m, 'Scrie greutatea în kilograme (de exemplu 78,4).');
    btn.disabled = true;
    var err = await upsertWeight(today(), v);
    btn.disabled = false;
    if (err) return msg(m, App.ro(err));
    render();
    var el = $('mpW'); if (el) el.scrollIntoView({ block: 'nearest' });
    App.msg($('mpWmsg'), 'Am notat ' + String(Math.round(v * 10) / 10).replace('.', ',') + ' kg pentru azi.', 'ok');
  }
  async function delWeight(id) {
    var r = await sb.from('body_weights').delete().eq('id', id);
    if (r.error) return msg($('mpWmsg'), App.ro(r.error));
    MP.weights = MP.weights.filter(function (x) { return x.id !== id; });
    render();
  }

  window.ClientApp = {
    start: function (acc) { MP.trainer = acc.trainer; MP.me = acc.client; bind(); load(); }
  };
})();
