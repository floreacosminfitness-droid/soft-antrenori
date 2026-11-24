// Planul clientului, văzut de antrenor (doar citire).
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
    return { warnings: p.warnings || [], checked: p.checked || {}, seedN: p.seedN || 0, menuV: p.menuV || null, days: p.days.map(function (d) {
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
    var p = { targets: row.targets, warnings: src.warnings || [], checked: src.checked || {}, seedN: src.seedN || 0, menuV: src.menuV || null, days: (src.days || []).map(function (d) {
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
  // aceeași regulă ca aplicația clientului: planul e bun cât timp e din ultimele 7 zile, pe aceleași calorii și același meniu
  function isCurrent() {
    if (!V.row) return false;
    if (daysBetween(V.row.week_start, today()) >= 7) return false;
    if (!sameTargets(V.row.targets, V.targets)) return false;
    return ((V.row.plan && V.row.plan.menuV) || null) === G.menuKey(V.menu);
  }
  async function makePlan() {
    var start = today(), seed = start + '#0', plan;
    if (V.menu) plan = G.menuPlan(V.content, V.menu, T0(), { seed: seed });
    else {
      var a = V.answers;
      plan = G.generate(V.content, Object.assign({}, a, { exclude: (a.exclude || []).slice(), seed: seed }), { prepared: V.db, targets: T0() });
    }
    plan.seedN = 0; plan.checked = {};
    var r = await sb.from('meal_plans').upsert({ user_id: V.client.id, week_start: start, targets: plan.targets, plan: serialize(plan), updated_at: new Date().toISOString() }, { onConflict: 'user_id,week_start' }).select('*').single();
    if (r.error) throw r.error;
    V.row = r.data;
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
  function render() {
    var el = V.el, first = V.client.full_name.split(/\s+/)[0];
    var h = '<section class="card pv"><div class="pv-head"><h2 style="margin:0">Planul lui ' + esc(first) + '</h2>';
    if (V.state === 'loading') { el.innerHTML = h + '</div><div class="loading">Se încarcă planul…</div></section>'; return; }
    if (V.state === 'error') { el.innerHTML = h + '</div><p class="msg">' + esc(V.err) + '</p><button type="button" class="btn btn-ghost btn-sm" data-pv="retry">Încearcă din nou</button></section>'; return; }
    if (!V.answers) { el.innerHTML = h + '</div><p class="muted small" style="margin:8px 0 0">Planul apare aici după ce ' + esc(first) + ' își completează datele și îi setezi caloriile.</p></section>'; return; }
    if (!V.targets) { el.innerHTML = h + '</div><p class="muted small" style="margin:8px 0 0">Setează caloriile mai sus. Planul se face imediat și îl vezi aici, exact cum îl primește ' + esc(first) + '.</p></section>'; return; }
    var p = V.plan, start = V.row.week_start, t = today();
    h += '<span class="small muted">' + (V.menu ? (V.menu.mode === 'pool' ? 'din alimentele alese de tine' : 'meniul făcut de tine') : 'meniu automat') + ' · săptămâna ' + fmtDate(start) + ' – ' + fmtDate(addDays(start, 6)) + '</span></div>';
    h += '<p class="muted small" style="margin:6px 0 12px">Exact ce vede ' + esc(first) + ' în aplicație' + (V.made ? '. Planul a fost refăcut acum, pe cifrele salvate.' : ', cu mesele bifate și înlocuirile făcute de el.') + '</p>';
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
          '</article>';
      });
      (d.extra || []).forEach(function (e) { h += '<div class="mp-meal pv-meal is-done"><div class="mp-mhead"><div><div class="mp-slot">În plus</div><h3>' + esc(e.name) + (e.g ? ' · ' + R(e.g) + ' g' : '') + '</h3></div></div>' + nutHtml(e) + '</div>'; });
    }
    h += '</section>';
    el.innerHTML = h;
  }

  async function refresh(opts) {
    if (!V) return;
    opts = opts || {};
    V.state = 'loading'; V.made = false; if (!opts.quiet) render();
    try {
      await loadAll();
      if (V.answers && V.targets) {
        if (!isCurrent()) {
          if (V.canEdit) { await makePlan(); V.made = !!opts.saved; }
          else if (!V.row) { V.state = 'ok'; V.plan = null; }
        }
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
      if (d) { var v = d.getAttribute('data-pvday'); V.day = v === 'shop' ? 'shop' : +v; render(); return; }
      if (e.target.closest('[data-pv=retry]')) refresh();
    };
    refresh();
  }

  window.PlanView = { mount: mount, refresh: refresh };
})();
