/* COS FIT - generator de planuri alimentare
 * Primeste: chestionarul clientului + baza de alimente si retete (cosfit_retete.json)
 * Intoarce: tinte (kcal, macro), plan pe 7 zile cu gramaje, lista de cumparaturi.
 * Merge in browser (window.CosfitGen) si in Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---- Cifrele metodei (Cosmin le poate schimba aici, intr-un singur loc) ----
  var CONFIG = {
    activity: { sedentar: 1.2, usor: 1.375, moderat: 1.55, activ: 1.725, foarte_activ: 1.9 },
    goalFactor: { slabire: -0.20, mentinere: 0, masa: 0.10 },
    proteinPerKg: 2.0,          // g proteine / kg corp
    proteinMaxBmi: 25,          // peste IMC 30, proteinele se calculeaza pe greutatea la IMC 25
    fatShare: 0.27,             // din calorii
    minKcal: { m: 1500, f: 1200 },
    roundKcal: 50,
    tolerance: 0.05,            // +-5% fata de calorii
    adjustStep: 100,            // kcal la fiecare ajustare
    adjustEveryDays: 14,
    noRepeatDays: 3,
    // impartirea caloriilor pe mese, dupa numarul de mese pe zi
    meals: {
      3: [['md', 'Mic dejun', 0.30], ['pc', 'Prânz', 0.40], ['pc', 'Cină', 0.30]],
      4: [['md', 'Mic dejun', 0.25], ['pc', 'Prânz', 0.35], ['g', 'Gustare', 0.10], ['pc', 'Cină', 0.30]],
      5: [['md', 'Mic dejun', 0.25], ['g', 'Gustare', 0.10], ['pc', 'Prânz', 0.30], ['g', 'Gustare', 0.10], ['pc', 'Cină', 0.25]]
    }
  };

  // ---- generator pseudo-aleator cu samanta, ca acelasi client sa primeasca acelasi plan ----
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---- 1-3. Tinte zilnice ----
  function targets(q, cfg) {
    cfg = cfg || CONFIG;
    var w = +q.weight, h = +q.height, a = +q.age, male = q.sex === 'm';
    var bmr = 10 * w + 6.25 * h - 5 * a + (male ? 5 : -161);
    var maint = bmr * (cfg.activity[q.activity] || 1.2);
    var kcal = maint * (1 + (cfg.goalFactor[q.goal] || 0)) + (q.kcalAdjust || 0);
    var floor = Math.max(cfg.minKcal[male ? 'm' : 'f'], bmr);
    var floored = kcal < floor;
    kcal = Math.round(Math.max(kcal, floor) / cfg.roundKcal) * cfg.roundKcal;
    var bmi = w / Math.pow(h / 100, 2);
    var protW = bmi > 30 ? cfg.proteinMaxBmi * Math.pow(h / 100, 2) : w;
    var p = Math.round(cfg.proteinPerKg * protW);
    var f = Math.round(kcal * cfg.fatShare / 9);
    var c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
    return { bmr: Math.round(bmr), maintenance: Math.round(maint), kcal: kcal, p: p, c: c, f: f, floored: floored };
  }

  // Tinte puse de antrenor (kcal + grame de proteine, carbohidrati, grasimi), folosite ca atare.
  function fixedTargets(t) {
    var kcal = Math.round(+t.kcal || 0), p = Math.round(+t.p || 0), c = Math.round(+t.c || 0), f = Math.round(+t.f || 0);
    return { kcal: kcal, p: p, c: c, f: f, fixed: true };
  }

  // ---- pregatirea retetelor: fiecare ingredient primeste un rol (proteina, carbo, grasime, leguma) ----
  function prepare(data) {
    var food = {};
    data.foods.forEach(function (x) { food[x.id] = x; });
    var FIXED = { sos_soia: 1, mustar: 1, usturoi: 1, lamaie: 1, miere: 0, bulion: 1 };
    function role(x) {
      if (FIXED[x.id] || x.kcal < 45) return 'v';
      var e = x.p * 4 + x.c * 4 + x.f * 9 || 1;
      if (x.p * 4 / e >= 0.3) return 'p';
      if (x.f * 9 / e >= 0.5) return 'f';
      return 'c';
    }
    var PROT = { 'Carne': 'carne', 'Pește': 'peste', 'Ouă': 'oua', 'Lactate': 'lactate', 'Lactate fără lactoză': 'lactate', 'Proteine vegetale': 'vegetal', 'Leguminoase': 'vegetal', 'Băuturi vegetale': 'vegetal', 'Mezeluri': 'carne' };
    var recipes = data.recipes.map(function (r) {
      var best = null, bestP = 0;
      var ing = r.ing.map(function (pair) {
        var x = food[pair[0]], g = pair[1];
        if (x.p * g > bestP) { bestP = x.p * g; best = x; }
        return { id: x.id, g: g, role: role(x), x: x };
      });
      var src = best ? (best.id.indexOf('pui') >= 0 ? 'pui' : best.id.indexOf('curcan') >= 0 ? 'curcan' : best.id.indexOf('porc') >= 0 || best.id === 'cotlet_porc' ? 'porc' : best.id.indexOf('vita') >= 0 ? 'vita' : PROT[best.cat] || 'altele') : 'altele';
      return { r: r, ing: ing, src: src };
    });
    return { food: food, recipes: recipes };
  }

  function sumMacros(ing, s) {
    var t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
    ing.forEach(function (it) {
      var k = (s ? s[it.role] : 1) * it.g / 100;
      t.kcal += it.x.kcal * k; t.p += it.x.p * k; t.c += it.x.c * k; t.f += it.x.f * k; t.fib += it.x.fib * k;
    });
    return t;
  }

  // ---- 6. Scalarea: gaseste cat sa mareasca fiecare grup ca sa atinga tintele mesei ----
  var BOUNDS = { p: [0.5, 2.3], c: [0.3, 2.3], f: [0.4, 2.2] };
  function fit(rec, T, wide) {
    var G = { p: [0, 0, 0], c: [0, 0, 0], f: [0, 0, 0], v: [0, 0, 0] };
    rec.ing.forEach(function (it) {
      var k = it.g / 100; G[it.role][0] += it.x.p * k; G[it.role][1] += it.x.c * k; G[it.role][2] += it.x.f * k;
    });
    var base = sumMacros(rec.ing);
    var ratio = T.kcal / base.kcal;
    var s = { p: ratio, c: ratio, f: ratio, v: Math.min(1.6, Math.max(wide ? 0.5 : 0.8, ratio)) };
    var W = [4, 4, 9], tgt = [T.p, T.c, T.f];
    var keys = ['p', 'c', 'f'].filter(function (k) { return G[k][0] + G[k][1] + G[k][2] > 0.01; });
    // un ingredient mic in reteta (sub 20% din calorii) nu are voie sa devina vedeta: se scaleaza doar 0,7-1,5x
    var B = {};
    keys.forEach(function (k) {
      var share = (G[k][0] * 4 + G[k][1] * 4 + G[k][2] * 9) / base.kcal;
      B[k] = wide ? (share < 0.2 ? [0.4, 1.6] : [0.15, 2.6]) : share < 0.2 ? [Math.max(BOUNDS[k][0], 0.7), 1.5] : BOUNDS[k];
      s[k] = Math.min(B[k][1], Math.max(B[k][0], s[k]));
    });
    for (var it = 0; it < 60; it++) {
      keys.forEach(function (k) {
        // optimul pentru s[k] cand celelalte sunt fixe (cele mai mici patrate, ponderate in kcal)
        var num = 0, den = 0;
        for (var m = 0; m < 3; m++) {
          var rest = s.v * G.v[m];
          keys.forEach(function (j) { if (j !== k) rest += s[j] * G[j][m]; });
          var wm = W[m] * W[m] * (m === 0 ? 2 : 1); // proteinele conteaza dublu
          num += wm * G[k][m] * (tgt[m] - rest); den += wm * G[k][m] * G[k][m];
        }
        if (den > 0) s[k] = Math.min(B[k][1], Math.max(B[k][0], num / den));
      });
    }
    var got = sumMacros(rec.ing, s);
    var err = Math.abs(got.kcal - T.kcal) / T.kcal + 1.5 * Math.max(0, T.p - got.p) * 4 / T.kcal + 0.5 * Math.abs(got.f - T.f) * 9 / T.kcal;
    return { s: s, got: got, err: err };
  }

  // rotunjire la gramaje practice
  function roundIng(it, s) {
    var g = it.g * s[it.role];
    if (it.id === 'ou') { var n = Math.max(1, Math.round(g / 55)); return { g: n * 55, label: n + (n === 1 ? ' ou' : ' ouă') }; }
    if (it.id === 'rondele_orez') { var nr = Math.max(1, Math.round(g / 8)); return { g: nr * 8, label: nr + ' buc' }; }
    if (it.id === 'wasa') { var nw = Math.max(1, Math.round(g / 11)); return { g: nw * 11, label: nw + ' buc' }; }
    var step = g < 15 ? 1 : 5;
    g = Math.max(step, Math.round(g / step) * step);
    return { g: g, label: null };
  }

  function buildMeal(rec, T) {
    var f = fit(rec, T);
    var items = rec.ing.map(function (it) {
      var rd = roundIng(it, f.s);
      return { id: it.id, name: it.x.name.replace(/ \(1 .*?\)$/, ''), g: rd.g, label: rd.label, x: it.x, role: it.role };
    });
    var m = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
    items.forEach(function (i) { var k = i.g / 100; m.kcal += i.x.kcal * k; m.p += i.x.p * k; m.c += i.x.c * k; m.f += i.x.f * k; m.fib += i.x.fib * k; });
    return { recipe: rec.r, src: rec.src, items: items, macros: m, err: f.err };
  }

  function allowed(rec, q) {
    var r = rec.r;
    if (q.diet === 'vegetarian' && !r.veg) return false;
    if (q.diet === 'fara_lactoza' && !r.lf) return false;
    if (q.diet === 'vegetarian_fara_lactoza' && !(r.veg && r.lf)) return false;
    if (q.maxMinutes && r.min > q.maxMinutes) return false;
    if (q.exclude && q.exclude.length) {
      for (var i = 0; i < rec.ing.length; i++) if (q.exclude.indexOf(rec.ing[i].id) >= 0) return false;
    }
    return true;
  }

  // ---- 4-7. Planul pe 7 zile ----
  function generate(data, q, opts) {
    opts = opts || {};
    var cfg = opts.config || CONFIG;
    var db = opts.prepared || prepare(data);
    // Soft antrenori: tintele stabilite de antrenor au prioritate fata de calculul automat
    var T = opts.targets ? fixedTargets(opts.targets) : targets(q, cfg);
    var slots = cfg.meals[q.meals || 4] || cfg.meals[4];
    var rand = rng(hash(JSON.stringify([q.seed || '', q.sex, q.age, q.weight, q.height, q.goal, q.diet, q.meals, T.kcal])));
    var pool = db.recipes.filter(function (rec) { return allowed(rec, q); });
    var byMeal = { md: [], pc: [], g: [] };
    pool.forEach(function (rec) { byMeal[rec.r.meal].push(rec); });
    var lastUsed = {}; // reteta -> ziua
    var days = [];
    var warnings = [];
    ['md', 'pc', 'g'].forEach(function (k) {
      if (slots.some(function (sl) { return sl[0] === k; }) && byMeal[k].length < 4) warnings.push('Prea puține rețete pentru „' + k + '” cu filtrele alese.');
    });

    for (var d = 0; d < 7; d++) {
      var day = null;
      for (var attempt = 0; attempt < 6 && !day; attempt++) {
        var meals = [], usedSrc = {}, tot = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
        for (var si = 0; si < slots.length; si++) {
          var sl = slots[si];
          var remainingShare = 0; for (var sj = si; sj < slots.length; sj++) remainingShare += slots[sj][2];
          // tinta mesei: partea ei din ce a ramas din zi (corecteaza abaterile meselor de dinainte)
          var share = sl[2] / remainingShare;
          var MT = { kcal: (T.kcal - tot.kcal) * share, p: Math.max(5, (T.p - tot.p) * share), c: Math.max(0, (T.c - tot.c) * share), f: Math.max(2, (T.f - tot.f) * share) };
          var cands = byMeal[sl[0]].filter(function (rec) {
            var lu = lastUsed[rec.r.id];
            if (lu !== undefined && d - lu < cfg.noRepeatDays) return false;
            if (meals.some(function (m) { return m.recipe.id === rec.r.id; })) return false;
            if (sl[0] === 'pc' && usedSrc[rec.src] && rec.src !== 'vegetal') return false;
            return true;
          });
          if (!cands.length) cands = byMeal[sl[0]].filter(function (rec) { return !meals.some(function (m) { return m.recipe.id === rec.r.id; }); });
          if (!cands.length) { warnings.push('Nu am găsit rețete pentru ' + sl[1] + '.'); continue; }
          var scored = cands.map(function (rec) { return { rec: rec, m: buildMeal(rec, MT) }; });
          if ((!q.diet || q.diet === 'clasic') && sl[0] === 'pc') scored.forEach(function (x) { if (x.rec.r.veg) x.m.err += 0.025; });
          scored.sort(function (a, b) { return a.m.err - b.m.err; });
          var top = scored.slice(0, Math.max(1, Math.min(5, Math.ceil(scored.length / 4))));
          var pick = top[Math.floor(rand() * top.length)];
          var meal = pick.m; meal.slot = sl[1]; meal.type = sl[0]; meal.target = MT; meal.share = sl[2];
          meals.push(meal); usedSrc[meal.src] = true;
          tot.kcal += meal.macros.kcal; tot.p += meal.macros.p; tot.c += meal.macros.c; tot.f += meal.macros.f; tot.fib += meal.macros.fib;
        }
        var ok = Math.abs(tot.kcal - T.kcal) / T.kcal <= cfg.tolerance && tot.p >= T.p * 0.95;
        if (ok || attempt === 5) day = { meals: meals, totals: tot, ok: ok };
      }
      day.meals.forEach(function (m) { lastUsed[m.recipe.id] = d; });
      days.push(day);
    }
    var avgP = days.reduce(function (t, d) { return t + d.totals.p; }, 0) / 7;
    if (avgP < T.p * 0.95) warnings.push('Ținta de proteine (' + T.p + ' g) e greu de atins doar din rețete cu filtrele alese; planul ajunge în medie la ' + Math.round(avgP) + ' g. Un shake proteic pe zi rezolvă diferența.');
    return { targets: T, days: days, shopping: shopping(days), warnings: warnings, slots: slots.map(function (s) { return s[1]; }) };
  }

  // ---- 8. Lista de cumparaturi pe saptamana ----
  function shopping(days) {
    var acc = {};
    days.forEach(function (d) { d.meals.forEach(function (m) { m.items.forEach(function (i) {
      if (!acc[i.id]) acc[i.id] = { id: i.id, name: i.name, cat: i.x.cat, g: 0 };
      acc[i.id].g += i.g;
    }); }); });
    var byCat = {};
    Object.keys(acc).forEach(function (k) { var it = acc[k]; (byCat[it.cat] = byCat[it.cat] || []).push(it); });
    return Object.keys(byCat).sort().map(function (c) {
      return { cat: c, items: byCat[c].sort(function (a, b) { return a.name.localeCompare(b.name, 'ro'); }) };
    });
  }

  // ---- 9. Ajustarea la 2 saptamani, dupa greutatea din Jurnal ----
  // weights: [{date:'YYYY-MM-DD', kg}] ; since: data ultimei ajustari (sau a inceputului planului)
  function adjust(q, weights, since, today, cfg) {
    cfg = cfg || CONFIG;
    var day = function (s) { return Math.floor(Date.parse(s) / 864e5); };
    var t0 = day(since), tN = day(today);
    if (tN - t0 < cfg.adjustEveryDays) return { change: 0, reason: 'Mai sunt ' + (cfg.adjustEveryDays - (tN - t0)) + ' zile până la următoarea verificare.', due: false };
    var first = weights.filter(function (w) { var x = day(w.date); return x >= t0 && x < t0 + 7; });
    var last = weights.filter(function (w) { var x = day(w.date); return x > tN - 7 && x <= tN; });
    if (first.length < 2 || last.length < 2) return { change: 0, reason: 'Nu sunt destule cântăriri: trebuie măcar două în prima și două în ultima săptămână.', due: true };
    var avg = function (a) { return a.reduce(function (s, w) { return s + w.kg; }, 0) / a.length; };
    var a1 = avg(first), a2 = avg(last);
    var weeks = Math.max(1, (tN - t0 - 6) / 7);
    var pct = (a2 - a1) / a1 * 100 / weeks; // % pe saptamana
    var step = cfg.adjustStep, change = 0, reason;
    if (q.goal === 'slabire') {
      if (pct > -0.2) { change = -step; reason = 'Greutatea nu a scăzut (' + String(pct.toFixed(2)).replace('.', ',') + '% pe săptămână), deci scădem ' + step + ' kcal.'; }
      else if (pct < -1.0) { change = step; reason = 'Scazi prea repede (' + String(pct.toFixed(2)).replace('.', ',') + '% pe săptămână), adăugăm ' + step + ' kcal ca să păstrăm masa musculară.'; }
      else reason = 'Slăbești în ritm bun (' + String(pct.toFixed(2)).replace('.', ',') + '% pe săptămână). Planul rămâne la fel.';
    } else if (q.goal === 'masa') {
      if (pct < 0.1) { change = step; reason = 'Greutatea nu a crescut (' + String(pct.toFixed(2)).replace('.', ',') + '% pe săptămână), deci adăugăm ' + step + ' kcal.'; }
      else if (pct > 0.5) { change = -step; reason = 'Crești prea repede (' + String(pct.toFixed(2)).replace('.', ',') + '% pe săptămână), scădem ' + step + ' kcal.'; }
      else reason = 'Crești în ritm bun (' + String(pct.toFixed(2)).replace('.', ',') + '% pe săptămână). Planul rămâne la fel.';
    } else {
      if (pct > 0.3) { change = -step; reason = 'Greutatea crește, scădem ' + step + ' kcal.'; }
      else if (pct < -0.3) { change = step; reason = 'Greutatea scade, adăugăm ' + step + ' kcal.'; }
      else reason = 'Greutatea e stabilă. Ai găsit echilibrul, planul rămâne la fel.';
    }
    return { change: change, reason: reason, due: true, from: +a1.toFixed(1), to: +a2.toFixed(1), pctPerWeek: +pct.toFixed(2) };
  }

  // ---- 10. Inlocuiri: ingredient, masa intreaga, excludere permanenta ----
  // Cum apare fiecare aliment in textul retetelor: a = articulat ("puiul"), b = nearticulat ("pui").
  // Prima forma din fiecare lista e cea folosita cand alimentul devine ingredientul nou.
  var TERMS = {
    piept_pui: { a: ['pieptul de pui', 'puiul'], b: ['piept de pui', 'pui'] },
    pulpa_pui: { a: ['pulpele de pui', 'pulpele', 'puiul'], b: ['pulpe de pui', 'pulpe', 'pui'] },
    piept_curcan: { a: ['pieptul de curcan', 'curcanul'], b: ['piept de curcan', 'curcan'] },
    pulpa_curcan: { a: ['pulpa de curcan', 'curcanul', 'carnea'], b: ['pulpă de curcan', 'curcan'] },
    muschi_porc: { a: ['mușchiulețul de porc', 'mușchiulețul', 'carnea'], b: ['mușchiuleț de porc', 'mușchiuleț'] },
    cotlet_porc: { a: ['cotletul de porc', 'cotletul'], b: ['cotlet de porc', 'cotlet'] },
    vita_slaba: { a: ['carnea de vită', 'carnea', 'vita'], b: ['vită'] },
    muschi_vita: { a: ['mușchiul de vită', 'carnea'], b: ['mușchi de vită', 'vită'] },
    piept_rata: { a: ['pieptul de rață'], b: ['piept de rață', 'rață'] },
    miel_pulpa: { a: ['carnea de miel', 'carnea'], b: ['miel'] },
    cod: { a: ['fileul de cod', 'codul', 'peștele', 'fileul'], b: ['cod'] },
    lavraki: { a: ['fileul de lavraki', 'fileul de pește', 'peștele', 'fileul'], b: ['lavraki'] },
    dorada: { a: ['dorada', 'peștele'], b: ['doradă'] },
    pangasius: { a: ['fileul de pangasius', 'peștele', 'fileul'], b: ['pangasius'] },
    tilapia: { a: ['fileul de tilapia', 'peștele', 'fileul'], b: ['tilapia'] },
    salau: { a: ['șalăul', 'peștele'], b: ['șalău'] },
    somon: { a: ['somonul', 'peștele'], b: ['somon'] },
    pastrav: { a: ['păstrăvul', 'peștele'], b: ['păstrăv'] },
    macrou: { a: ['macroul', 'peștele'], b: ['macrou'] },
    creveti: { a: ['creveții'], b: ['creveți'] },
    calamar: { a: ['calamarul'], b: ['calamar'] },
    tofu: { a: ['tofu'], b: ['tofu'] },
    tofu_afumat: { a: ['tofu afumat', 'tofu'], b: ['tofu afumat', 'tofu'] },
    tempeh: { a: ['tempeh'], b: ['tempeh'] },
    seitan: { a: ['seitanul'], b: ['seitan'] },
    curcan_tocat: { a: ['carnea tocată de curcan', 'carnea tocată', 'carnea'], b: ['curcan tocat', 'curcan'] },
    vita_tocata: { a: ['carnea tocată de vită', 'carnea tocată', 'carnea'], b: ['vită tocată', 'vită'] },
    soia_texturata: { a: ['soia texturată', 'soia'], b: ['soia texturată', 'soia'] },
    ton_apa: { a: ['tonul'], b: ['ton'] },
    ton_ulei: { a: ['tonul'], b: ['ton în ulei', 'ton'] },
    sardine: { a: ['sardinele'], b: ['sardine'] },
    somon_afumat: { a: ['somonul afumat', 'somonul'], b: ['somon afumat'] },
    ou: { a: ['ouăle', 'oul'], b: ['ouă', 'ou'] },
    albus: { a: ['albușurile'], b: ['albușuri'] },
    iaurt_gr: { a: ['iaurtul grecesc', 'iaurtul'], b: ['iaurt grecesc', 'iaurt'] },
    iaurt_gr_fl: { a: ['iaurtul fără lactoză', 'iaurtul'], b: ['iaurt fără lactoză', 'iaurt'] },
    iaurt_fl: { a: ['iaurtul fără lactoză', 'iaurtul'], b: ['iaurt fără lactoză', 'iaurt'] },
    iaurt_soia: { a: ['iaurtul de soia', 'iaurtul'], b: ['iaurt de soia', 'iaurt'] },
    skyr: { a: ['skyr-ul'], b: ['skyr'] },
    branza_vaci: { a: ['brânza de vaci', 'brânza'], b: ['brânză de vaci', 'brânză'] },
    branza_vaci_fl: { a: ['brânza de vaci fără lactoză', 'brânza de vaci', 'brânza'], b: ['brânză de vaci fără lactoză', 'brânză de vaci', 'brânză'] },
    cottage: { a: ['cottage cheese', 'cottage'], b: ['cottage cheese', 'cottage'] },
    ricotta: { a: ['ricotta'], b: ['ricotta'] },
    lapte: { a: ['laptele'], b: ['lapte'] },
    lapte_35: { a: ['laptele'], b: ['lapte'] },
    lapte_fl: { a: ['laptele fără lactoză', 'laptele'], b: ['lapte fără lactoză', 'lapte'] },
    kefir: { a: ['chefirul'], b: ['chefir'] },
    bautura_ovaz: { a: ['băutura de ovăz', 'băutura'], b: ['băutură de ovăz'] },
    bautura_soia: { a: ['băutura de soia', 'băutura'], b: ['băutură de soia'] },
    bautura_migdale: { a: ['băutura de migdale', 'băutura'], b: ['băutură de migdale'] },
    telemea: { a: ['telemeaua'], b: ['telemea'] },
    telemea_oaie: { a: ['telemeaua de oaie', 'telemeaua'], b: ['telemea de oaie', 'telemea'] },
    feta: { a: ['feta'], b: ['feta'] },
    mozzarella_l: { a: ['mozzarella'], b: ['mozzarella'] },
    mozzarella: { a: ['mozzarella'], b: ['mozzarella'] },
    mozzarella_fl: { a: ['mozzarella fără lactoză', 'mozzarella'], b: ['mozzarella fără lactoză', 'mozzarella'] },
    cascaval: { a: ['cașcavalul'], b: ['cașcaval'] },
    naut: { a: ['năutul'], b: ['năut'] },
    fasole_rosie: { a: ['fasolea roșie', 'fasolea'], b: ['fasole roșie', 'fasole'] },
    fasole_alba: { a: ['fasolea albă', 'fasolea'], b: ['fasole albă', 'fasole'] },
    fasole_neagra: { a: ['fasolea neagră', 'fasolea'], b: ['fasole neagră', 'fasole'] },
    linte_fiarta: { a: ['lintea'], b: ['linte'] },
    edamame: { a: ['edamame'], b: ['edamame'] },
    orez_basmati: { a: ['orezul basmati', 'orezul'], b: ['orez basmati', 'orez'] },
    orez_brun: { a: ['orezul brun', 'orezul'], b: ['orez brun', 'orez'] },
    orez_alb: { a: ['orezul'], b: ['orez'] },
    quinoa: { a: ['quinoa'], b: ['quinoa'] },
    cuscus: { a: ['cuscusul'], b: ['cuscus'] },
    bulgur: { a: ['bulgurul'], b: ['bulgur'] },
    hrisca: { a: ['hrișca'], b: ['hrișcă'] },
    mei: { a: ['meiul'], b: ['mei'] },
    malai: { a: ['mămăliga', 'mălaiul'], b: ['mămăligă', 'mălai'] },
    cartofi: { a: ['cartofii'], b: ['cartofi'] },
    cartofi_dulci: { a: ['cartofii dulci', 'cartofii'], b: ['cartofi dulci', 'cartofi'] },
    paste_int: { a: ['pastele integrale', 'pastele', 'tăițeii'], b: ['paste integrale', 'paste', 'tăiței integrali', 'tăiței'] },
    paste_dur: { a: ['pastele'], b: ['paste'] },
    paine_int: { a: ['pâinea integrală', 'pâinea'], b: ['pâine integrală', 'pâine'] },
    paine_secara: { a: ['pâinea de secară', 'pâinea'], b: ['pâine de secară', 'pâine'] },
    paine_seminte: { a: ['pâinea cu semințe', 'pâinea'], b: ['pâine cu semințe', 'pâine'] },
    lipie_int: { a: ['lipia'], b: ['lipie integrală', 'lipie'] },
    pita_int: { a: ['pita'], b: ['pita integrală', 'pita'] },
    wasa: { a: ['Wasa'], b: ['Wasa'] },
    rondele_orez: { a: ['rondelele de orez', 'rondelele'], b: ['rondele de orez', 'rondele'] },
    rondele_porumb: { a: ['rondelele de porumb', 'rondelele'], b: ['rondele de porumb', 'rondele'] },
    crackers_int: { a: ['crackers'], b: ['crackers integrali', 'crackers'] },
    ovaz: { a: ['ovăzul'], b: ['ovăz'] },
    muesli: { a: ['musli'], b: ['musli'] },
    tarate_ovaz: { a: ['tărâțele de ovăz', 'tărâțele'], b: ['tărâțe de ovăz', 'tărâțe'] },
    fulgi_porumb: { a: ['fulgii de porumb'], b: ['fulgi de porumb'] },
    banana: { a: ['banana'], b: ['banană'] },
    mar: { a: ['mărul'], b: ['măr'] },
    para: { a: ['para'], b: ['pară', 'pere'] },
    portocala: { a: ['portocala'], b: ['portocală'] },
    mandarina: { a: ['mandarinele'], b: ['mandarine'] },
    kiwi: { a: ['kiwi'], b: ['kiwi'] },
    capsuni: { a: ['căpșunile'], b: ['căpșuni'] },
    afine: { a: ['afinele'], b: ['afine'] },
    zmeura: { a: ['zmeura'], b: ['zmeură'] },
    mure: { a: ['murele'], b: ['mure'] },
    fructe_padure: { a: ['fructele de pădure', 'fructele'], b: ['fructe de pădure', 'fructe'] },
    cirese: { a: ['cireșele'], b: ['cireșe'] },
    visine: { a: ['vișinele'], b: ['vișine'] },
    struguri: { a: ['strugurii'], b: ['struguri'] },
    piersica: { a: ['piersicile'], b: ['piersici'] },
    caise: { a: ['caisele'], b: ['caise'] },
    prune: { a: ['prunele'], b: ['prune'] },
    ananas: { a: ['ananasul'], b: ['ananas'] },
    mango: { a: ['mango'], b: ['mango'] },
    pepene_rosu: { a: ['pepenele'], b: ['pepene roșu', 'pepene'] },
    nuci: { a: ['nucile'], b: ['nuci'] },
    migdale: { a: ['migdalele'], b: ['migdale'] },
    alune_padure: { a: ['alunele'], b: ['alune'] },
    caju: { a: ['caju'], b: ['caju'] },
    fistic: { a: ['fisticul'], b: ['fistic'] },
    arahide: { a: ['arahidele'], b: ['arahide'] },
    seminte_dovleac: { a: ['semințele de dovleac', 'semințele'], b: ['semințe de dovleac', 'semințe'] },
    seminte_floarea: { a: ['semințele de floarea-soarelui', 'semințele'], b: ['semințe de floarea-soarelui', 'semințe'] },
    seminte_in: { a: ['semințele de in', 'semințele'], b: ['semințe de in', 'semințe'] },
    chia: { a: ['semințele de chia', 'chia'], b: ['semințe de chia', 'chia'] },
    canepa: { a: ['semințele de cânepă', 'semințele'], b: ['semințe de cânepă', 'cânepă'] },
    unt_arahide: { a: ['untul de arahide'], b: ['unt de arahide'] },
    unt_migdale: { a: ['untul de migdale'], b: ['unt de migdale'] },
    tahini: { a: ['tahini'], b: ['tahini'] },
    hummus: { a: ['hummus'], b: ['hummus'] },
    ulei_masline: { a: ['uleiul de măsline', 'uleiul'], b: ['ulei de măsline', 'ulei'] },
    ulei_floarea: { a: ['uleiul de floarea-soarelui', 'uleiul'], b: ['ulei de floarea-soarelui', 'ulei'] },
    ulei_rapita: { a: ['uleiul de rapiță', 'uleiul'], b: ['ulei de rapiță', 'ulei'] },
    broccoli: { a: ['broccoli'], b: ['broccoli'] },
    conopida: { a: ['conopida'], b: ['conopidă'] },
    fasole_verde: { a: ['fasolea verde', 'fasolea'], b: ['fasole verde'] },
    spanac: { a: ['spanacul'], b: ['spanac'] },
    dovlecel: { a: ['dovlecelul', 'dovleceii'], b: ['dovlecel', 'dovlecei'] },
    ciuperci: { a: ['ciupercile'], b: ['ciuperci'] },
    pleurotus: { a: ['ciupercile pleurotus', 'ciupercile'], b: ['ciuperci pleurotus', 'pleurotus', 'ciuperci'] },
    ardei: { a: ['ardeiul', 'ardeii'], b: ['ardei'] },
    varza: { a: ['varza'], b: ['varză'] },
    varza_rosie: { a: ['varza roșie', 'varza'], b: ['varză roșie', 'varză'] },
    varza_bruxelles: { a: ['varza de Bruxelles'], b: ['varză de Bruxelles'] },
    sparanghel: { a: ['sparanghelul'], b: ['sparanghel'] },
    mix_legume: { a: ['legumele'], b: ['legume'] },
    kale: { a: ['kale'], b: ['kale'] },
    vinete: { a: ['vinetele'], b: ['vinete'] },
    mazare: { a: ['mazărea'], b: ['mazăre'] },
    salata: { a: ['salata'], b: ['salată'] },
    rucola: { a: ['rucola'], b: ['rucola'] },
    castravete: { a: ['castravetele'], b: ['castravete', 'castraveți'] },
    rosii: { a: ['roșiile', 'roșia'], b: ['roșii', 'roșie'] },
    rosii_cherry: { a: ['roșiile cherry', 'roșiile'], b: ['roșii cherry', 'roșii'] },
    morcov: { a: ['morcovul'], b: ['morcov'] },
    ridichi: { a: ['ridichile'], b: ['ridichi'] }
  };
  // Cand se schimba garnitura sau proteina, timpul de gatire poate fi altul: adaugam un pas scurt.
  var COOK = {
    orez_basmati: 'Orezul basmati se fierbe 12 minute.', orez_brun: 'Orezul brun se fierbe 25 de minute.', orez_alb: 'Orezul se fierbe 15 minute.',
    quinoa: 'Quinoa se fierbe 12 minute.', cuscus: 'Cuscusul se acoperă cu apă fierbinte și se lasă 5 minute.',
    bulgur: 'Bulgurul se acoperă cu apă fierbinte și se lasă 10 minute.', hrisca: 'Hrișca se fierbe 12 minute.', mei: 'Meiul se fierbe 15 minute.',
    malai: 'Mămăliga: presară mălaiul în apă clocotită cu sare și amestecă 8–10 minute.',
    cartofi: 'Cartofii se fierb 15–20 de minute sau se coc 25 de minute la 200°C.',
    cartofi_dulci: 'Cartofii dulci se coc 25 de minute la 200°C sau 8–10 minute la microunde.',
    paste_int: 'Pastele se fierb după indicațiile de pe ambalaj.', paste_dur: 'Pastele se fierb după indicațiile de pe ambalaj.',
    tofu: 'Tofu se rumenește 5–6 minute la foc mare.', tofu_afumat: 'Tofu afumat se rumenește 3–4 minute.', tempeh: 'Tempeh se rumenește 3 minute pe fiecare parte.',
    seitan: 'Seitanul se rumenește 4 minute.', creveti: 'Creveții se gătesc 3–4 minute.', calamar: 'Calamarul se gătește 2–3 minute la foc mare.',
    cod: 'Fileul de cod se gătește 3–4 minute pe fiecare parte.', lavraki: 'Fileul de lavraki se gătește 3 minute pe fiecare parte.',
    pangasius: 'Fileul de pangasius se gătește 3–4 minute pe fiecare parte.', tilapia: 'Fileul de tilapia se gătește 3 minute pe fiecare parte.',
    salau: 'Șalăul se gătește 3–4 minute pe fiecare parte.', somon: 'Somonul se gătește 4 minute pe fiecare parte.',
    pastrav: 'Păstrăvul se gătește 4–5 minute pe fiecare parte sau 20 de minute la cuptor.', macrou: 'Macroul se coace 15–18 minute la 200°C.',
    dorada: 'Dorada se coace 18–20 de minute la 200°C.', piept_rata: 'Pieptul de rață se gătește 5 minute pe fiecare parte.',
    linte_fiarta: 'Lintea fiartă se încălzește 2–3 minute.',
    piept_pui: 'Pieptul de pui se gătește 6–7 minute pe fiecare parte, sau 6–7 minute tăiat cuburi.',
    pulpa_pui: 'Pulpele de pui se gătesc 8–10 minute pe fiecare parte, sau 25 de minute la cuptor.',
    piept_curcan: 'Pieptul de curcan se gătește 6–7 minute pe fiecare parte, sau 6–7 minute tăiat cuburi.',
    pulpa_curcan: 'Pulpa de curcan tăiată cuburi se gătește 8–10 minute.',
    muschi_porc: 'Mușchiulețul de porc tăiat felii se gătește 3–4 minute pe fiecare parte.',
    cotlet_porc: 'Cotletul de porc se gătește 4 minute pe fiecare parte.',
    vita_slaba: 'Carnea de vită se gătește 3–4 minute pe fiecare parte, la tigaie fierbinte.',
    muschi_vita: 'Mușchiul de vită se gătește 3 minute pe fiecare parte și se lasă 5 minute înainte de tăiere.',
    miel_pulpa: 'Carnea de miel tăiată cuburi se gătește 12–15 minute.',
    curcan_tocat: 'Carnea tocată de curcan se rumenește 6–7 minute.',
    vita_tocata: 'Carnea tocată de vită se rumenește 6–7 minute.',
    soia_texturata: 'Soia texturată se hidratează 10 minute în apă fierbinte, apoi se scurge.'
  };

  var LET = 'A-Za-zĂÂÎȘȚăâîșțŞŢşţ';
  function escRe(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // inlocuieste in text alimentul vechi cu cel nou, pastrand forma (articulat / nearticulat) si majuscula
  function renameText(text, oldId, newId, otherIds) {
    var o = TERMS[oldId], n = TERMS[newId];
    if (!o || !n || !text) return text;
    var taken = {};
    (otherIds || []).forEach(function (id) { var t = TERMS[id]; if (t) t.a.concat(t.b).forEach(function (f) { taken[f.toLowerCase()] = 1; }); });
    var forms = [];
    o.a.forEach(function (f) { if (!taken[f.toLowerCase()]) forms.push([f, 'a']); });
    o.b.forEach(function (f) { if (!taken[f.toLowerCase()]) forms.push([f, 'b']); });
    if (!forms.length) return text;
    forms.sort(function (x, y) { return y[0].length - x[0].length; });
    var re = new RegExp('(^|[^' + LET + '-])(' + forms.map(function (f) { return escRe(f[0]); }).join('|') + ')(?=$|[^' + LET + '])', 'gi');
    return text.replace(re, function (m, pre, word) {
      var low = word.toLowerCase(), f = null;
      for (var i = 0; i < forms.length; i++) if (forms[i][0].toLowerCase() === low) { f = forms[i]; break; }
      var out = f[1] === 'a' ? n.a[0] : n.b[0];
      if (word.charAt(0) !== word.charAt(0).toLowerCase()) out = out.charAt(0).toUpperCase() + out.slice(1);
      return pre + out;
    });
  }

  // Grupuri de echivalente: un aliment se poate inlocui doar cu altul din acelasi grup.
  var SWAP_GROUPS = [
    ['Carne și pește', ['piept_pui', 'pulpa_pui', 'piept_curcan', 'pulpa_curcan', 'muschi_porc', 'cotlet_porc', 'vita_slaba', 'muschi_vita', 'piept_rata', 'miel_pulpa', 'cod', 'lavraki', 'dorada', 'pangasius', 'tilapia', 'salau', 'somon', 'pastrav', 'macrou', 'creveti', 'calamar', 'tofu', 'tofu_afumat', 'tempeh', 'seitan']],
    ['Carne tocată', ['curcan_tocat', 'vita_tocata', 'soia_texturata']],
    ['Pește din conservă', ['ton_apa', 'ton_ulei', 'sardine', 'somon_afumat']],
    ['Ouă', ['ou', 'albus']],
    ['Lactate proteice', ['iaurt_gr', 'iaurt_gr_fl', 'skyr', 'branza_vaci', 'branza_vaci_fl', 'cottage', 'ricotta', 'iaurt_soia', 'iaurt_fl']],
    ['Lapte', ['lapte', 'lapte_fl', 'lapte_35', 'kefir', 'bautura_ovaz', 'bautura_soia', 'bautura_migdale']],
    ['Brânzeturi', ['telemea', 'telemea_oaie', 'feta', 'mozzarella_l', 'mozzarella', 'mozzarella_fl', 'cascaval']],
    ['Leguminoase', ['naut', 'fasole_rosie', 'fasole_alba', 'fasole_neagra', 'linte_fiarta', 'edamame']],
    ['Garnituri', ['orez_basmati', 'orez_brun', 'orez_alb', 'quinoa', 'cuscus', 'bulgur', 'hrisca', 'mei', 'malai', 'cartofi', 'cartofi_dulci']],
    ['Paste', ['paste_int', 'paste_dur']],
    ['Pâine', ['paine_int', 'paine_secara', 'paine_seminte', 'lipie_int', 'pita_int', 'wasa', 'rondele_orez', 'rondele_porumb', 'crackers_int']],
    ['Fulgi', ['ovaz', 'muesli', 'tarate_ovaz', 'fulgi_porumb']],
    ['Fructe', ['banana', 'mar', 'para', 'portocala', 'mandarina', 'kiwi', 'capsuni', 'afine', 'zmeura', 'mure', 'fructe_padure', 'cirese', 'visine', 'struguri', 'piersica', 'caise', 'prune', 'ananas', 'mango', 'pepene_rosu']],
    ['Nuci și semințe', ['nuci', 'migdale', 'alune_padure', 'caju', 'fistic', 'arahide', 'seminte_dovleac', 'seminte_floarea', 'seminte_in', 'chia', 'canepa']],
    ['Creme', ['unt_arahide', 'unt_migdale', 'tahini', 'hummus']],
    ['Uleiuri', ['ulei_masline', 'ulei_floarea', 'ulei_rapita']],
    ['Legume gătite', ['broccoli', 'conopida', 'fasole_verde', 'spanac', 'dovlecel', 'ciuperci', 'pleurotus', 'ardei', 'varza', 'varza_rosie', 'varza_bruxelles', 'sparanghel', 'mix_legume', 'kale', 'vinete', 'mazare']],
    ['Legume crude', ['salata', 'rucola', 'castravete', 'rosii', 'rosii_cherry', 'ardei', 'morcov', 'ridichi']]
  ];
  function dietOk(x, q) {
    var veg = q.diet === 'vegetarian' || q.diet === 'vegetarian_fara_lactoza';
    var lf = q.diet === 'fara_lactoza' || q.diet === 'vegetarian_fara_lactoza';
    if (veg && /[mf]/.test(x.flags)) return false;
    if (lf && x.flags.indexOf('d') >= 0) return false;
    if (q.exclude && q.exclude.indexOf(x.id) >= 0) return false;
    return true;
  }
  function macroOf(x, g) { var k = g / 100; return { kcal: x.kcal * k, p: x.p * k, c: x.c * k, f: x.f * k, fib: x.fib * k }; }
  // cate grame din alimentul nou dau acelasi lucru ca vechiul (proteine, carbohidrati sau calorii, dupa rol)
  function equivGrams(oldX, oldG, newX, role) {
    var key = role === 'p' ? 'p' : role === 'c' ? 'c' : role === 'f' ? 'kcal' : null;
    var g = key && newX[key] > 0.5 ? oldG * oldX[key] / newX[key] : oldG;
    if (key && (!isFinite(g) || g > oldG * 4)) g = oldG * oldX.kcal / Math.max(1, newX.kcal);
    if (newX.id === 'ou') { var n = Math.max(1, Math.round(g / 55)); return { g: n * 55, label: n + (n === 1 ? ' ou' : ' ouă') }; }
    var step = g < 15 ? 1 : 5;
    return { g: Math.max(step, Math.round(g / step) * step), label: null };
  }
  // gramajul final: echivalent pe macro, apoi corectat (max +-30%) ca masa sa pastreze caloriile
  function swapGrams(meal, ii, nx) {
    var it = meal.items[ii], eq = equivGrams(it.x, it.g, nx, it.role);
    if (eq.label || it.role === 'v') return eq;
    var oldK = macroOf(it.x, it.g).kcal, newK = macroOf(nx, eq.g).kcal;
    var g = eq.g + (oldK - newK) / Math.max(0.5, nx.kcal / 100);
    g = Math.min(eq.g * 1.3, Math.max(eq.g * 0.7, g));
    var step = g < 15 ? 1 : 5;
    return { g: Math.max(step, Math.round(g / step) * step), label: null };
  }
  function ingredientOptions(data, item, q, meal, ii) {
    var food = {}; data.foods.forEach(function (x) { food[x.id] = x; });
    var out = [];
    SWAP_GROUPS.forEach(function (gr) {
      if (gr[1].indexOf(item.id) < 0) return;
      gr[1].forEach(function (id) {
        if (id === item.id || !food[id] || out.some(function (o) { return o.id === id; }) || !dietOk(food[id], q)) return;
        var eq = meal ? swapGrams(meal, ii, food[id]) : equivGrams(item.x, item.g, food[id], item.role);
        out.push({ id: id, name: food[id].name.replace(/ \(1 .*?\)$/, ''), g: eq.g, label: eq.label, kcal: Math.round(macroOf(food[id], eq.g).kcal), group: gr[0] });
      });
    });
    return out;
  }
  function recomputeMeal(m) {
    var t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
    m.items.forEach(function (i) { var a = macroOf(i.x, i.g); t.kcal += a.kcal; t.p += a.p; t.c += a.c; t.f += a.f; t.fib += a.fib; });
    m.macros = t; return m;
  }
  function refreshPlan(plan, cfg) {
    cfg = cfg || CONFIG; var T = plan.targets;
    plan.days.forEach(function (d) {
      var t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
      d.meals.forEach(function (m) { t.kcal += m.macros.kcal; t.p += m.macros.p; t.c += m.macros.c; t.f += m.macros.f; t.fib += m.macros.fib; });
      d.totals = t; d.ok = Math.abs(t.kcal - T.kcal) / T.kcal <= cfg.tolerance && t.p >= T.p * 0.95;
    });
    plan.shopping = shopping(plan.days); return plan;
  }
  function swapIngredient(data, plan, di, mi, ii, newId) {
    var food = {}; data.foods.forEach(function (x) { food[x.id] = x; });
    var m = plan.days[di].meals[mi], it = m.items[ii], nx = food[newId];
    var eq = swapGrams(m, ii, nx);
    m.swaps = (m.swaps || []).concat([it.name + ' → ' + nx.name.replace(/ \(1 .*?\)$/, '')]);
    var others = m.items.filter(function (x, k) { return k !== ii; }).map(function (x) { return x.id; });
    m.name = renameText(m.name || m.recipe.name, it.id, nx.id, others);
    var hint = COOK[nx.id] && COOK[nx.id] !== COOK[it.id] ? COOK[nx.id] : null;
    m.steps = (m.steps || m.recipe.steps.slice()).map(function (st) {
      if (it.id === 'malai' && nx.id !== 'malai') st = st.replace(/\s+din\s+mălai\s+și\s+\d+\s*ml\s+apă/gi, '');
      var nst = renameText(st, it.id, nx.id, others);
      // daca pasul era despre alimentul schimbat si avem timpul corect pentru cel nou, scoatem timpul vechi
      if (hint && nst !== st) {
        nst = nst.replace(/\s*\(\d+(?:[–-]\d+)?\s*(?:de\s+)?minute\)/g, '')
                 .replace(/,?\s*(?:încă\s+)?\d+(?:[–-]\d+)?\s*(?:de\s+)?minute(?:\s+pe\s+(?:fiecare\s+)?parte)?/g, '')
                 .replace(/,?\s*apoi\s+las-(?:o|l)(?=\s*[.,]|$)/g, '').replace(/\s+([.,])/g, '$1').replace(/,\./g, '.');
      }
      return nst;
    });
    m.cook = m.cook || {};
    if (hint) m.cook[ii] = hint; else if (COOK[nx.id] !== COOK[it.id]) delete m.cook[ii];
    m.items[ii] = { id: nx.id, name: nx.name.replace(/ \(1 .*?\)$/, ''), g: eq.g, label: eq.label, x: nx, role: it.role };
    m.planItems = null; // dupa o inlocuire, gramajele noi devin baza pentru recalculari
    recomputeMeal(m); return refreshPlan(plan);
  }
  // 3 retete potrivite pentru aceeasi masa, cu calorii si macro apropiate
  function mealAlternatives(data, plan, di, mi, q, opts) {
    opts = opts || {};
    var db = opts.prepared || prepare(data);
    var day = plan.days[di], m = day.meals[mi];
    var T = { kcal: m.macros.kcal, p: m.macros.p, c: m.macros.c, f: m.macros.f };
    var near = {};
    plan.days.forEach(function (d, k) { if (Math.abs(k - di) < CONFIG.noRepeatDays) d.meals.forEach(function (x) { near[x.recipe.id] = 1; }); });
    var cands = db.recipes.filter(function (rec) { return rec.r.meal === m.type && !near[rec.r.id] && allowed(rec, q); });
    if (cands.length < 3) cands = db.recipes.filter(function (rec) { return rec.r.meal === m.type && rec.r.id !== m.recipe.id && allowed(rec, q); });
    var scored = cands.map(function (rec) { var b = buildMeal(rec, T); b.slot = m.slot; b.type = m.type; b.target = T; return b; });
    scored.sort(function (a, b) { return a.err - b.err; });
    return scored.slice(0, opts.n || 3);
  }
  function replaceMeal(plan, di, mi, meal) { var old = plan.days[di].meals[mi]; meal.share = old.share; meal.slot = old.slot; meal.type = old.type; plan.days[di].meals[mi] = meal; return refreshPlan(plan); }
  // excludere permanenta: alimentul intra in profil, iar mesele care il contin sunt inlocuite
  function excludeFood(data, plan, q, foodId, opts) {
    q.exclude = (q.exclude || []).concat(q.exclude && q.exclude.indexOf(foodId) >= 0 ? [] : [foodId]);
    var changed = 0;
    plan.days.forEach(function (d, di) {
      d.meals.forEach(function (m, mi) {
        if (!m.items.some(function (i) { return i.id === foodId; })) return;
        var alt = mealAlternatives(data, plan, di, mi, q, opts)[0];
        if (alt) { d.meals[mi] = alt; changed++; }
      });
    });
    refreshPlan(plan); return changed;
  }

  // ---- 11. Ziua de azi: ce a mancat clientul si cat mai are de mancat ----
  // Fiecare masa din plan are o stare: nemarcata (inca de mancat), 'eaten' (a mancat-o cum era in plan),
  // 'skipped' (a sarit-o) sau 'other' (a mancat altceva: restaurant, cod de bare, poza).
  // Ce a mancat in plus fata de plan sta in day.extra. Dupa fiecare marcare, mesele ramase se recalculeaza
  // pe caloriile si macro-urile care au mai ramas din zi.
  var MIN_MEAL = { md: 200, pc: 250, g: 100 };   // sub atat nu coboram o masa ramasa (kcal)
  function zero() { return { kcal: 0, p: 0, c: 0, f: 0, fib: 0 }; }
  function add(t, m) { t.kcal += m.kcal || 0; t.p += m.p || 0; t.c += m.c || 0; t.f += m.f || 0; t.fib += m.fib || 0; return t; }
  // o intrare de mancare: dintr-un aliment din baza (x + grame) sau cu valori scrise de mana
  function foodEntry(x, g, source) {
    var e = macroOf(x, g); e.name = x.name.replace(/ \(1 .*?\)$/, ''); e.g = g; e.id = x.id; e.source = source || 'baza';
    return e;
  }
  function manualEntry(name, kcal, p, c, f, source) {
    kcal = +kcal || 0; p = +p || 0; c = +c || 0; f = +f || 0;
    // doar caloriile stiute: impartim ca o masa obisnuita (25% proteine, 45% carbo, 30% grasimi) si spunem asta
    var est = !(p || c || f) && kcal > 0;
    if (est) { p = kcal * 0.25 / 4; c = kcal * 0.45 / 4; f = kcal * 0.30 / 9; }
    return { name: name || 'Altceva', kcal: kcal, p: p, c: c, f: f, fib: 0, source: source || 'manual', estimated: est };
  }
  // o intrare din valorile la 100 g ale unui produs (cod de bare, produs salvat de client)
  function per100Entry(name, v, g, source) {
    var k = g / 100;
    return { name: name, g: g, kcal: (+v.kcal || 0) * k, p: (+v.p || 0) * k, c: (+v.c || 0) * k, f: (+v.f || 0) * k, fib: (+v.fib || 0) * k, source: source || 'cod de bare', code: v.code };
  }
  function eatenOf(day) {
    var t = zero();
    day.meals.forEach(function (m) {
      if (m.status === 'eaten') add(t, m.macros);
      else if (m.status === 'other') (m.actual || []).forEach(function (e) { add(t, e); });
    });
    (day.extra || []).forEach(function (e) { add(t, e); });
    return t;
  }
  function shareOf(m, slots) { return m.share || 1 / slots; }
  // recalculeaza mesele nemarcate ale zilei ca sa ajunga exact la ce a mai ramas
  function rebalanceDay(plan, di, cfg) {
    cfg = cfg || CONFIG;
    var T = plan.targets, day = plan.days[di];
    var eaten = eatenOf(day);
    var left = { kcal: T.kcal - eaten.kcal, p: T.p - eaten.p, c: T.c - eaten.c, f: T.f - eaten.f };
    var pending = day.meals.filter(function (m) { return !m.status; });
    var shareSum = pending.reduce(function (s, m) { return s + shareOf(m, day.meals.length); }, 0) || 1;
    var floorHit = false;
    pending.forEach(function (m) {
      if (!m.planItems) { m.planItems = m.items.map(function (i) { return { id: i.id, name: i.name, g: i.g, label: i.label, x: i.x, role: i.role }; }); m.planKcal = m.macros.kcal; }
      if (m.planKcal == null) m.planKcal = sumMacros(m.planItems).kcal;
      var sh = shareOf(m, day.meals.length) / shareSum;
      var MT = { kcal: left.kcal * sh, p: Math.max(0, left.p * sh), c: Math.max(0, left.c * sh), f: Math.max(0, left.f * sh) };
      var floor = MIN_MEAL[m.type] || 150;
      if (MT.kcal < floor) {
        // masa ar iesi prea mica: o pastram la minim, cu proportiile ei din plan si proteinele intregi
        floorHit = true;
        var base = sumMacros(m.planItems), k = floor / Math.max(1, base.kcal);
        MT = { kcal: floor, p: Math.max(base.p * k, Math.min(base.p, floor * 0.35 / 4)), c: base.c * k * 0.8, f: base.f * k * 0.8 };
      }
      MT.p = Math.max(5, MT.p); MT.f = Math.max(2, MT.f);
      var rec = { r: m.recipe, ing: m.planItems.map(function (i) { return { id: i.id, g: i.g, role: i.role, x: i.x }; }) };
      var ft = fit(rec, MT, true);
      // caloriile au prioritate: daca masa iese peste/sub tinta, ajustam intai carbohidratii si grasimile, apoi proteinele
      for (var pass = 0; pass < 4; pass++) {
        var got = sumMacros(rec.ing, ft.s), delta = got.kcal - MT.kcal;
        if (Math.abs(delta) <= MT.kcal * 0.03) break;
        var grp = sumMacros(rec.ing.filter(function (i) { return i.role === 'c' || i.role === 'f'; }), ft.s).kcal;
        var keys2 = grp > 20 && pass < 3 ? ['c', 'f'] : ['p', 'c', 'f'];
        var pool2 = sumMacros(rec.ing.filter(function (i) { return keys2.indexOf(i.role) >= 0; }), ft.s).kcal;
        if (pool2 < 5) break;
        var k2 = Math.max(0.1, (pool2 - delta) / pool2);
        keys2.forEach(function (k) { ft.s[k] = Math.max(0.1, Math.min(3, ft.s[k] * k2)); });
      }
      m.items = m.planItems.map(function (i) {
        var rd = roundIng(i, ft.s);
        return { id: i.id, name: i.name, g: rd.g, label: rd.label, x: i.x, role: i.role };
      });
      m.target = MT; recomputeMeal(m);
      m.changed = Math.abs(m.macros.kcal - m.planKcal) >= 25 ? m.macros.kcal - m.planKcal : 0;
    });
    var planned = zero(); pending.forEach(function (m) { add(planned, m.macros); });
    day.today = { eaten: eaten, left: left, planned: planned, end: add(add(zero(), eaten), planned),
      over: Math.max(0, eaten.kcal + planned.kcal - T.kcal * (1 + cfg.tolerance)) > 0 ? eaten.kcal + planned.kcal - T.kcal : 0, floorHit: floorHit, pending: pending.length };
    plan.shopping = shopping(plan.days);
    return day.today;
  }
  function markMeal(plan, di, mi, status, actual) {
    var m = plan.days[di].meals[mi];
    if (!status) { delete m.status; delete m.actual; }
    else { m.status = status; if (status === 'other') m.actual = actual || []; else delete m.actual; }
    if (m.planItems && status !== 'eaten') { // o masa marcata sau redeschisa revine la gramajele din plan
      m.items = m.planItems.map(function (i) { return { id: i.id, name: i.name, g: i.g, label: i.label, x: i.x, role: i.role }; });
      recomputeMeal(m); m.changed = 0;
    }
    return rebalanceDay(plan, di);
  }
  function addExtra(plan, di, entry) { var d = plan.days[di]; (d.extra = d.extra || []).push(entry); return rebalanceDay(plan, di); }
  function removeExtra(plan, di, k) { var d = plan.days[di]; (d.extra || []).splice(k, 1); return rebalanceDay(plan, di); }
  // cauta in baza de alimente (pentru „am mancat altceva”)
  function searchFoods(data, text, n) {
    var norm = function (x) { return x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    var q = norm(text || '').trim(); if (q.length < 2) return [];
    var words = q.split(/\s+/);
    return data.foods.filter(function (x) { var t = norm(x.name + ' ' + x.cat); return words.every(function (w) { return t.indexOf(w) >= 0; }); })
      .sort(function (a, b) { return norm(a.name).indexOf(q) - norm(b.name).indexOf(q) || a.name.length - b.name.length; })
      .slice(0, n || 8);
  }

  var api = { CONFIG: CONFIG, targets: targets, fixedTargets: fixedTargets, prepare: prepare, generate: generate, adjust: adjust,
    SWAP_GROUPS: SWAP_GROUPS, TERMS: TERMS, renameText: renameText, stepsOf: function (m) { return (m.steps || m.recipe.steps).concat(Object.keys(m.cook || {}).map(function (k) { return m.cook[k]; })); },
    ingredientOptions: ingredientOptions, swapIngredient: swapIngredient,
    mealAlternatives: mealAlternatives, replaceMeal: replaceMeal, excludeFood: excludeFood,
    refreshPlan: refreshPlan, recomputeMeal: recomputeMeal,
    MIN_MEAL: MIN_MEAL, foodEntry: foodEntry, manualEntry: manualEntry, eatenOf: eatenOf, rebalanceDay: rebalanceDay,
    per100Entry: per100Entry, markMeal: markMeal, addExtra: addExtra, removeExtra: removeExtra, searchFoods: searchFoods };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CosfitGen = api;
})(this);
