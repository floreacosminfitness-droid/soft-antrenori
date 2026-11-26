// Planul clientului, văzut de antrenor (poate schimba o masă sau face un plan nou).
// Arată planul salvat al clientului: exact ce vede el, cu mesele bifate și înlocuirile lui.
// Dacă planul nu mai corespunde caloriilor sau meniului setat (sau nu există încă), îl face și îl salvează
// chiar aici, cu același motor și aceeași regulă ca aplicația clientului, ca să vadă amândoi același plan.
// Expune window.PlanView.mount(el, { client, profile }) și .refresh().
(function () {
  var App = window.App, G = window.CosfitGen, sb = App.sb, esc = App.esc;
  function R(n) { return Math.round(n); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function addDays(s, n) { return new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
  function fmtDate(s) { return App.fmtDate(s + 'T12:00:00Z').replace(/ \d{4}$/, ''); }
  var DAYS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  var DAYS3 = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
  function sameTargets(a, b) { return a && b && a.kcal === b.kcal && a.p === b.p && a.c === b.c && a.f === b.f; }

  var V = null; // starea vizualizării

  // ---- același format de salvare ca aplicația clientului ----
  function serialize(p) {
    return { warnings: p.warnings || [], checked: p.checked || {}, seedN: p.seedN || 0, menuV: p.menuV || null, since: p.since || null, days: p.days.map(function (d) {
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
  function fname(id) { return (V.food[id] ? V.food[id].name : id).replace(/ \(1 .*?\)$/, ''); }
  function hydrate(row) {
    var src = row.plan || {};
    var p = { targets: row.targets, warnings: src.warnings || [], checked: src.checked || {}, seedN: src.seedN || 0, menuV: src.menuV || null, since: src.since || row.week_start, days: (src.days || []).map(function (d) {
      return { meals: d.meals.filter(function (m) { return V.recipe[m.rid]; }).map(function (m) {
        var meal = { recipe: V.recipe[m.rid], slot: m.slot, type: m.type, target: m.target, items: m.items.filter(function (i) { return V.food[i[0]]; }).map(function (i) {
          return { id: i[0], name: fname(i[0]), g: i[1], label: i[2], role: i[3], x: V.food[i[0]] };
        }) };
        if (m.name) meal.name = m.name; if (m.steps) meal.steps = m.steps; if (m.cook) meal.cook = m.cook; if (m.swaps) meal.swaps = m.swaps; if (m.share) meal.share = m.share;
        if (m.pi) meal.planItems = m.pi.filter(function (i) { return V.food[i[0]]; }).map(function (i) { return { id: i[0], name: fname(i[0]), g: i[1], label: i[2], role: i[3], x: V.food[i[0]] }; });
        if (m.st) meal.status = m.st;
        if (m.act) meal.actual = m.act;
        return G.recomputeMeal(meal);
      }), extra: d.extra || [] };
    }) };
    G.refreshPlan(p);
    p.days.forEach(function (d, di) { if (d.extra.length || d.meals.some(function (m) { return m.status; })) G.rebalanceDay(p, di); });
    return p;
  }

  // ---- încărcare ----
  async function loadAll() {
    var cid = V.client.id;
    var q = await Promise.all([
      V.content ? Promise.resolve({ data: { data: V.content } }) : sb.from('meal_content').select('data').eq('id', 1).single(),
      sb.from('meal_profiles').select('answers').eq('user_id', cid).maybeSingle(),
      sb.from('client_targets').select('*').eq('client_id', cid).maybeSingle(),
      sb.from('client_menus').select('*').eq('client_id', cid).maybeSingle(),
      sb.from('meal_plans').select('*').eq('user_id', cid).order('week_start', { ascending: false }).limit(1)
    ]);
    var err = q.find(function (x) { return x.error; }); if (err) throw err.error;
    if (!V.content) {
      V.content = q[0].data.data; V.db = G.prepare(V.content);
      V.baseFood = {}; V.baseRecipe = {};
      V.content.foods.forEach(function (f) { V.baseFood[f.id] = f; });
      V.content.recipes.forEach(function (r) { V.baseRecipe[r.id] = r; });
    }
    V.food = Object.assign({}, V.baseFood); V.recipe = Object.assign({}, V.baseRecipe);
    V.answers = (q[1].data && q[1].data.answers) || null;
    V.targets = q[2].data || null;
    V.menu = q[3].data || null;
    if (V.menu) {
      G.menuRecipes(V.menu).forEach(function (r) { V.recipe[r.id] = r; });
      Object.keys(V.menu.foods || {}).forEach(function (k) { V.food[k] = V.menu.foods[k]; });
    }
    V.row = (q[4].data && q[4].data[0]) || null;
  }
  function T0() { var t = V.targets; return { kcal: t.kcal, p: t.p, c: t.c, f: t.f }; }
  // aceeași regulă ca aplicația clientului: planul rămâne același; la calorii noi se schimbă doar gramajele
  async function saveRow(start, plan) {
    var r = await sb.from('meal_plans').upsert({ user_id: V.client.id, week_start: start, targets: plan.targets, plan: serialize(plan), updated_at: new Date().toISOString() }, { onConflict: 'user_id,week_start' }).select('*').single();
    if (r.error) throw r.error;
    V.row = r.data;
  }
  async function makePlan(seedN) {
    var start = today(), seed = start + '#' + (seedN || 0), plan;
    if (V.menu) plan = G.menuPlan(V.content, V.menu, T0(), { seed: seed });
    else {
      var a = V.answers;
      var avoid = [];
      if (seedN && V.row && V.row.plan && V.row.plan.days) V.row.plan.days.forEach(function (d) { d.meals.forEach(function (m) { if (avoid.indexOf(m.rid) < 0) avoid.push(m.rid); }); });
      plan = G.generate(V.content, Object.assign({}, a, { exclude: (a.exclude || []).slice(), seed: seed }), { prepared: V.db, targets: T0(), avoid: avoid });
    }
    plan.seedN = seedN || 0; plan.checked = {}; plan.since = start;
    await saveRow(start, plan);
  }
  // ce trebuie făcut ca planul salvat să fie la zi: '' = nimic
  function needed() {
    if (!V.row || !(V.row.plan && V.row.plan.days && V.row.plan.days.length)) return 'new';
    if (((V.row.plan && V.row.plan.menuV) || null) !== G.menuKey(V.menu)) return 'new';
    if (daysBetween(V.row.week_start, today()) >= 7) return 'roll';
    if (!sameTargets(V.row.targets, V.targets)) return 'retarget';
    return '';
  }
  async function bringUpToDate() {
    var n = needed();
    if (!n) return '';
    if (n === 'new') { await makePlan(0); return 'new'; }
    var cur = hydrate(V.row), changed = !sameTargets(V.row.targets, V.targets);
    if (n === 'roll') { await saveRow(today(), G.rollPlan(cur, changed ? T0() : null)); return changed ? 'retarget' : 'roll'; }
    var p = G.retargetPlan(cur, T0());
    var r = await sb.from('meal_plans').update({ targets: p.targets, plan: serialize(p), updated_at: new Date().toISOString() }).eq('id', V.row.id).select('*').single();
    if (r.error) throw r.error;
    V.row = r.data;
    return 'retarget';
  }

  // ---- afișare ----
  function nutHtml(m) {
    return '<div class="mp-nut"><div class="n kcal"><b>' + R(m.kcal) + '</b><span>kcal</span></div>' +
      '<div class="n p"><b>' + R(m.p) + ' g</b><span>proteine</span></div><div class="n c"><b>' + R(m.c) + ' g</b><span>carbo</span></div>' +
      '<div class="n f"><b>' + R(m.f) + ' g</b><span>grăsimi</span></div></div>';
  }
  function dayTotals(d) {
    var t = { kcal: 0, p: 0, c: 0, f: 0 };
    d.meals.forEach(function (m) { var x = m.macros || {}; t.kcal += x.kcal || 0; t.p += x.p || 0; t.c += x.c || 0; t.f += x.f || 0; });
    return t;
  }
  // modul de preparare, la fel ca în aplicația clientului
  function stepsHtml(m) {
    var steps = G.stepsOf(m);
    if (!steps.length && !m.recipe.cond) return '';
    if (m.recipe.trainer) return '<p class="mp-cond"><b>Indicații:</b> ' + steps.map(esc).join(' ') + '</p>';
    return '<details><summary>Cum se prepară</summary><ol>' + steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' + (m.recipe.cond ? '<p class="mp-cond">Condimente: ' + esc(m.recipe.cond) + '</p>' : '') + '</details>';
  }
  // schimbarea unei singure mese (doar la meniul automat; la meniul făcut de antrenor se schimbă din editorul de meniu)
  function canSwap() { return V.canEdit && !V.menu; }
  function altHtml(m, mi, st) {
    if (!canSwap() || st) return '';
    if (V.alt !== mi) return '<div class="mp-tools"><button type="button" data-pvalt="' + mi + '">Schimbă doar masa asta</button></div>';
    return '<div class="mp-box"><p>Alege altă rețetă (cam ' + R(m.macros.kcal) + ' kcal). Gramajele se potrivesc singure, restul zilei rămâne la fel:</p><div class="mp-opts mp-opts--col">' +
      V.alts.map(function (a, k) { return '<button type="button" class="mp-opt" data-pvpick="' + k + '"><span>' + esc(a.recipe.name) + '</span><small><span class="k">' + R(a.macros.kcal) + ' kcal</span> · <span class="p">' + R(a.macros.p) + ' P</span> · <span class="c">' + R(a.macros.c) + ' C</span> · <span class="f">' + R(a.macros.f) + ' G</span> · ' + a.recipe.min + ' min</small></button>'; }).join('') +
      (V.alts.length ? '' : '<p class="muted small">Nu am găsit alte rețete potrivite pentru masa asta.</p>') +
      '</div><div class="mp-tools"><button type="button" class="muted" data-pvalt="close">Renunță</button></div></div>';
  }
  function openAlts(mi) {
    var a = V.answers;
    V.alt = mi;
    V.alts = G.mealAlternatives(V.content, V.plan, V.day, mi, Object.assign({}, a, { exclude: (a.exclude || []).slice() }), { prepared: V.db, n: 5 });
  }
  async function pickAlt(k) {
    var d = V.plan.days[V.day], old = d.meals[V.alt], nw = V.alts[k];
    G.replaceMeal(V.plan, V.day, V.alt, nw);
    if ((d.extra && d.extra.length) || d.meals.some(function (x) { return x.status; })) G.rebalanceDay(V.plan, V.day);
    var r = await sb.from('meal_plans').update({ plan: serialize(V.plan), updated_at: new Date().toISOString() }).eq('id', V.row.id).select('*').single();
    if (r.error) throw r.error;
    V.row = r.data; V.plan = hydrate(V.row);
    var dn = DAYS[new Date(addDays(V.row.week_start, V.day) + 'T12:00:00Z').getUTCDay()].toLowerCase();
    V.flash = '„' + (old.name || old.recipe.name) + '” de ' + dn + ' a fost înlocuită cu „' + nw.recipe.name + '”. ' + V.client.full_name.split(/\s+/)[0] + ' o vede imediat în aplicație.';
    V.alt = null; V.alts = null; V.made = '';
  }
  function render() {
    var el = V.el, first = V.client.full_name.split(/\s+/)[0];
    var h = '<section class="card pv"><div class="pv-head"><h2 style="margin:0">Planul lui ' + esc(first) + '</h2>';
    if (V.state === 'loading') { el.innerHTML = h + '</div><div class="loading">Se încarcă planul…</div></section>'; return; }
    if (V.state === 'error') { el.innerHTML = h + '</div><p class="msg">' + esc(V.err) + '</p><button type="button" class="btn btn-ghost btn-sm" data-pv="retry">Încearcă din nou</button></section>'; return; }
    if (!V.answers) { el.innerHTML = h + '</div><p class="muted small" style="margin:8px 0 0">Planul apare aici după ce ' + esc(first) + ' își completează datele și îi setezi caloriile.</p></section>'; return; }
    if (!V.targets) { el.innerHTML = h + '</div><p class="muted small" style="margin:8px 0 0">Setează caloriile mai sus. Planul se face imediat și îl vezi aici, exact cum îl primește ' + esc(first) + '.</p></section>'; return; }
    var p = V.plan, start = V.row.week_start, t = today();
    h += '<span class="small muted">' + (V.menu ? (V.menu.mode === 'pool' ? 'din alimentele alese de tine' : 'meniul făcut de tine') : 'meniu automat') + ' · săptămâna ' + fmtDate(start) + ' – ' + fmtDate(addDays(start, 6)) + '</span></div>';
    var since = p.since || start, age = daysBetween(since, t);
    h += '<p class="muted small" style="margin:6px 0 12px">Exact ce vede ' + esc(first) + ' în aplicație, cu mesele bifate și înlocuirile făcute de el. Același plan din ' + fmtDate(since) + ' (' + (age < 1 ? 'de azi' : age === 1 ? 'de o zi' : 'de ' + age + ' zile') + ').</p>';
    if (V.made === 'retarget') h += '<div class="mp-banner">Caloriile s-au schimbat: mesele și alimentele au rămas aceleași, doar gramajele s-au potrivit pe ' + p.targets.kcal + ' kcal.</div>';
    if (V.flash) h += '<div class="mp-banner">' + esc(V.flash) + '</div>';
    if (V.made === 'new' && V.fresh) h += '<div class="mp-banner">Gata, ' + esc(first) + ' are un plan nou, cu alte mese, pe aceleași calorii.</div>';
    (p.warnings || []).forEach(function (w) { h += '<div class="mp-warn">' + esc(w) + '</div>'; });
    h += '<div class="mp-days" role="tablist">';
    for (var i = 0; i < 7; i++) { var ds = addDays(start, i); h += '<button type="button" role="tab" data-pvday="' + i + '" class="' + (V.day === i ? 'is-on' : '') + (ds === t ? ' today' : '') + '">' + DAYS3[new Date(ds + 'T12:00:00Z').getUTCDay()] + '<small>' + fmtDate(ds) + '</small></button>'; }
    h += '<button type="button" role="tab" data-pvday="shop" class="' + (V.day === 'shop' ? 'is-on' : '') + '">Cumpărături<small>săptămâna</small></button></div>';
    if (V.day === 'shop') {
      h += '<div class="mp-shop pv-shop">' + p.shopping.map(function (c) {
        return '<h4>' + esc(c.cat) + '</h4>' + c.items.map(function (i) { var on = !!p.checked[i.id]; return '<label class="' + (on ? 'done' : '') + '"><span>' + esc(i.name) + '</span><em>' + (i.g >= 1000 ? (i.g / 1000).toFixed(2).replace('.', ',') + ' kg' : i.g + ' g') + '</em></label>'; }).join('');
      }).join('') + '</div>';
    } else {
      var d = p.days[V.day], tot = dayTotals(d), T = p.targets;
      h += '<div class="pv-day"><b>' + DAYS[new Date(addDays(start, V.day) + 'T12:00:00Z').getUTCDay()] + '</b><span>' + R(tot.kcal) + ' / ' + T.kcal + ' kcal · ' + R(tot.p) + ' P · ' + R(tot.c) + ' C · ' + R(tot.f) + ' G</span></div>';
      d.meals.forEach(function (m, mi) {
        var st = m.status;
        h += '<article class="mp-meal pv-meal c' + (mi % 4) + (st ? ' is-done' : '') + '"><div class="mp-mhead"><div><div class="mp-slot">' + esc(m.slot) + (m.recipe.min ? ' · ' + m.recipe.min + ' min' : '') + '</div><h3>' + esc(m.name || m.recipe.name) + '</h3></div>' +
          (st ? '<span class="mp-badge' + (st === 'skipped' ? ' skip' : st === 'other' ? ' oth' : '') + '">' + (st === 'eaten' ? 'Mâncat ✓' : st === 'skipped' ? 'Sărit' : 'A mâncat altceva') + '</span>' : '') + '</div>' +
          nutHtml(m.macros) +
          '<ul class="mp-ing is-locked">' + m.items.map(function (it) { return '<li><span>' + esc(it.name) + '</span><span>' + (it.label ? esc(it.label) + ' · ' : '') + it.g + ' g</span></li>'; }).join('') + '</ul>' +
          (m.swaps ? '<p class="mp-swapped">Înlocuit de client: ' + m.swaps.map(esc).join(', ') + '</p>' : '') +
          (st === 'other' && m.actual ? '<p class="mp-swapped">A mâncat: ' + m.actual.map(function (e) { return esc(e.name) + (e.g ? ' ' + R(e.g) + ' g' : ''); }).join(', ') + '</p>' : '') +
          stepsHtml(m) +
          altHtml(m, mi, st) +
          '</article>';
      });
      (d.extra || []).forEach(function (e) { h += '<div class="mp-meal pv-meal is-done"><div class="mp-mhead"><div><div class="mp-slot">În plus</div><h3>' + esc(e.name) + (e.g ? ' · ' + R(e.g) + ' g' : '') + '</h3></div></div>' + nutHtml(e) + '</div>'; });
    }
    if (V.canEdit) {
      h += '<div class="pv-new">' + (V.ask
        ? '<p class="small" style="margin:0 0 10px"><b>Sigur faci un plan nou?</b> ' + esc(first) + ' primește alte mese pentru toată săptămâna' + (age < 7 ? ', deși planul actual are doar ' + (age < 1 ? 'o zi' : age + ' zile') + '. De obicei merită schimbat după cel puțin o săptămână.' : '.') + ' Caloriile și macro-urile rămân aceleași.</p><div class="row"><button type="button" class="btn btn-sm" data-pv="new">Da, fă un plan nou</button><button type="button" class="btn btn-ghost btn-sm" data-pv="cancel">Renunț</button></div>'
        : '<button type="button" class="btn btn-ghost btn-sm" data-pv="ask">Fă un plan nou, cu alte mese</button><p class="muted small" style="margin:8px 0 0">Doar dacă ți-o cere clientul. Altfel planul rămâne același, iar când schimbi caloriile se ajustează doar gramajele.' + (canSwap() ? ' Pentru o singură masă, folosește „Schimbă doar masa asta” de sub ea.' : '') + '</p>') + '</div>';
    }
    h += '</section>';
    el.innerHTML = h;
  }

  async function refresh(opts) {
    if (!V) return;
    opts = opts || {};
    V.state = 'loading'; V.made = ''; V.fresh = false; V.ask = false; V.alt = null; V.alts = null; if (!opts.keepFlash) V.flash = ''; if (!opts.quiet) render();
    try {
      await loadAll();
      if (V.answers && V.targets) {
        if (V.canEdit) V.made = await bringUpToDate();
        if (V.row) {
          V.plan = hydrate(V.row);
          if (V.day === null) V.day = Math.max(0, Math.min(6, daysBetween(V.row.week_start, today())));
        }
      }
      V.state = 'ok';
    } catch (e) {
      V.state = 'error'; V.err = App.ro(e);
    }
    if (V.state === 'ok' && V.answers && V.targets && !V.plan) {
      V.el.innerHTML = '<section class="card pv"><h2 style="margin:0">Planul clientului</h2><p class="muted small" style="margin:8px 0 0">Planul se face când activezi un abonament sau când clientul își deschide aplicația.</p></section>';
      return;
    }
    render();
  }

  function mount(el, opts) {
    V = { el: el, client: opts.client, canEdit: opts.canEdit !== false, content: null, day: null, state: 'loading' };
    el.onclick = function (e) {
      var d = e.target.closest('[data-pvday]');
      if (d) { var v = d.getAttribute('data-pvday'); V.day = v === 'shop' ? 'shop' : +v; V.alt = null; V.flash = ''; render(); return; }
      var ab = e.target.closest('[data-pvalt]');
      if (ab) { var av = ab.getAttribute('data-pvalt'); if (av === 'close' || V.alt === +av) { V.alt = null; } else { V.flash = ''; openAlts(+av); } return render(); }
      var pk = e.target.closest('[data-pvpick]');
      if (pk) {
        if (V.busy) return; V.busy = true; pk.disabled = true;
        (async function () {
          try { await pickAlt(+pk.getAttribute('data-pvpick')); }
          catch (err) { V.alt = null; V.flash = 'Nu am putut salva: ' + App.ro(err); }
          V.busy = false; render();
        })();
        return;
      }
      if (e.target.closest('[data-pv=retry]')) return refresh();
      if (e.target.closest('[data-pv=ask]')) { V.ask = true; return render(); }
      if (e.target.closest('[data-pv=cancel]')) { V.ask = false; return render(); }
      var nb = e.target.closest('[data-pv=new]');
      if (nb) {
        nb.disabled = true;
        (async function () {
          try { await makePlan(((V.row && V.row.plan && V.row.plan.seedN) || 0) + 1); V.plan = hydrate(V.row); V.made = 'new'; V.fresh = true; V.ask = false; V.day = 0; V.flash = ''; render(); }
          catch (err) { V.ask = false; V.state = 'error'; V.err = App.ro(err); render(); }
        })();
      }
    };
    refresh();
  }

  window.PlanView = { mount: mount, refresh: refresh };
})();
