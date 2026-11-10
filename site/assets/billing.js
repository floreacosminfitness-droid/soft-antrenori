// Abonamentul antrenorului: starea lui, limita de clienți, planurile și plata prin Stripe.
// Billing.bar(b)  → bara scurtă din panou;  Billing.section(b, me, email) → pagina cu planurile.
(function () {
  var App = window.App, esc = App.esc;
  var PLANS = [
    { id: 'start', name: 'Start', clients: 10, month: 149, year: 1490, note: 'Pentru început sau pentru antrenorii cu clienți la sală.' },
    { id: 'pro', name: 'Pro', clients: 20, month: 249, year: 2490, note: 'Cel mai ales: loc de creștere, cost mai mic pe client.', best: true },
    { id: 'studio', name: 'Studio', clients: 50, month: 499, year: 4990, note: 'Pentru antrenorii online cu mulți clienți.' }
  ];
  var NAMES = { trial: 'Probă gratuită', gratuit: 'Cont gratuit', start: 'Start', pro: 'Pro', studio: 'Studio', none: 'Fără abonament' };
  var period = 'month';

  function lei(n) { return n.toLocaleString('ro-RO') + ' lei'; }
  function daysLeft(iso) { return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 864e5)); }
  function links() { return (App.config && App.config.PAYMENT_LINKS) || {}; }
  function payUrl(plan, per, me, email) {
    var u = (links()[plan] || {})[per];
    if (!u) return null;
    return u + (u.indexOf('?') < 0 ? '?' : '&') + 'client_reference_id=' + encodeURIComponent(me.id) + (email ? '&prefilled_email=' + encodeURIComponent(email) : '');
  }
  function portalUrl(email) {
    var u = App.config && App.config.BILLING_PORTAL;
    return u ? u + (email ? (u.indexOf('?') < 0 ? '?' : '&') + 'prefilled_email=' + encodeURIComponent(email) : '') : null;
  }
  function paid(b) { return ['start', 'pro', 'studio'].indexOf(b.plan) >= 0; }

  function usedTxt(b) { return b.active ? b.used + ' din ' + b.limit + ' clienți activi' : b.used + (b.used === 1 ? ' client activ' : ' clienți activi'); }
  function meter(b) {
    var pct = b.limit ? Math.min(100, b.used / b.limit * 100) : 100;
    return '<div class="meter' + (b.used >= b.limit ? ' full' : '') + '"><i style="width:' + pct + '%"></i></div>';
  }
  function statusLine(b) {
    if (b.plan === 'trial') { var d = daysLeft(b.trial_ends_at); return 'Mai ai ' + d + (d === 1 ? ' zi' : ' zile') + ' de probă (până pe ' + App.fmtDate(b.trial_ends_at) + '). Fără card, fără obligații.'; }
    if (b.plan === 'gratuit') return 'Cont gratuit, pus de noi.';
    if (b.plan === 'none') return 'Proba sau abonamentul s-au încheiat. Clienții își folosesc în continuare planurile, dar ca să le schimbi caloriile, meniul sau să le scrii, alege un abonament.';
    var s = (b.interval === 'year' ? 'anual' : 'lunar');
    if (b.status === 'past_due') return 'Abonament ' + s + '. Ultima plată nu a trecut: actualizează cardul ca să nu se oprească.';
    if (b.cancel_at_end) return 'Abonament ' + s + ', anulat: merge până pe ' + App.fmtDate(b.period_end) + '.';
    return 'Abonament ' + s + (b.period_end ? ', se reînnoiește pe ' + App.fmtDate(b.period_end) : '') + '.';
  }

  // planul următor, cu mai mulți clienți (null = peste 50: ofertă la cerere)
  function nextPlan(b) {
    var cur = { trial: -1, start: 0, pro: 1 }[b.plan];
    if (cur == null) return null;
    return PLANS.filter(function (p, i) { return i > cur && p.clients > b.limit; })[0] || null;
  }
  function de(n) { return n >= 20 ? n + ' de' : String(n); }
  function people(n) { return n === 1 ? 'o persoană a încercat' : n + ' persoane au încercat'; }

  // bara de sus din panou
  function bar(b) {
    var warn = b.plan === 'none' || b.status === 'past_due' || (b.plan === 'trial' && daysLeft(b.trial_ends_at) <= 3);
    var full = b.active && b.used >= b.limit;
    var left = b.limit - b.used, near = b.active && !full && b.limit >= 5 && left <= 2;
    var nx = nextPlan(b), blocked = +b.blocked_7d || 0;
    var head = '<b>' + NAMES[b.plan] + '</b> · ' + usedTxt(b) + (b.active ? meter(b) : '');
    if (full) {
      return '<section class="card limit-full" role="status"><div class="bill-bar"><div class="grow">' + head +
        '<p style="margin:10px 0 0"><b>Ai atins limita de ' + b.limit + ' clienți activi.</b> Clienții noi nu se mai pot înscrie din link-ul tău' +
        (blocked ? ': <b>' + people(blocked) + ' în ultimele 7 zile.</b>' : '.') + '</p>' +
        '<p class="small muted" style="margin:6px 0 0">' + (nx ? 'Cu ' + nx.name + ' ai loc pentru ' + de(nx.clients) + ' clienți, de la ' + lei(nx.month) + ' pe lună.' : 'Pentru mai mult de ' + b.limit + ' clienți îți facem o ofertă personalizată.') + ' Sau arhivează un client care nu mai lucrează cu tine.</p></div>' +
        '<button type="button" class="btn btn-sm" data-bill="open">' + (nx ? 'Treci la ' + nx.name : 'Cere ofertă') + '</button></div></section>';
    }
    return '<section class="card' + (warn ? ' paywall' : '') + '"><div class="bill-bar"><div class="grow">' + head +
      '<p class="small muted" style="margin:8px 0 0">' + esc(statusLine(b)) + '</p>' +
      (near ? '<p class="small" style="margin:6px 0 0"><b>Mai ai loc pentru ' + (left === 1 ? 'un singur client' : left + ' clienți') + '.</b> La limită, clienții noi nu se mai pot înscrie' + (nx ? ': ' + nx.name + ' are ' + de(nx.clients) + ' locuri.' : '.') + '</p>' : '') +
      '</div>' +
      '<button type="button" class="btn ' + (warn || near || b.plan === 'trial' ? '' : 'btn-ghost ') + 'btn-sm" data-bill="open">' + (paid(b) ? (near && nx ? 'Treci la ' + nx.name : 'Abonamentul meu') : 'Alege abonamentul') + '</button></div></section>';
  }

  function plansHtml(b, me, email) {
    var cur = paid(b) ? b.plan : null, ready = !!(links().start && links().start.month);
    return '<div class="tabs" data-bill-per style="max-width:340px;margin:0 auto 4px">' +
      '<button type="button" data-per="month" class="' + (period === 'month' ? 'on' : '') + '">Lunar</button>' +
      '<button type="button" data-per="year" class="' + (period === 'year' ? 'on' : '') + '">Anual · −17%</button></div>' +
      '<div class="plans">' + PLANS.map(function (p) {
        var price = period === 'month' ? p.month : p.year, url = payUrl(p.id, period, me, email);
        var btn;
        if (cur === p.id) btn = '<span class="btn btn-ghost btn-block" aria-disabled="true">Planul tău</span>';
        else if (cur) btn = portalUrl(email) ? '<a class="btn btn-ghost btn-block" href="' + esc(portalUrl(email)) + '" target="_blank" rel="noopener">Schimbă pe ' + p.name + '</a>' : '';
        else if (url) btn = '<a class="btn btn-block' + (p.best ? '' : ' btn-ghost') + '" href="' + esc(url) + '">Alege ' + p.name + '</a>';
        else btn = '<span class="btn btn-ghost btn-block" aria-disabled="true">În curând</span>';
        return '<div class="plan' + (p.best ? ' best' : '') + (cur === p.id ? ' cur' : '') + '">' + (p.best ? '<span class="plan-tag">Recomandat</span>' : '') +
          '<h3>' + p.name + '</h3><div class="price">' + lei(price) + ' <small>/ ' + (period === 'month' ? 'lună' : 'an') + '</small></div>' +
          '<div class="small muted">până la <b>' + p.clients + ' clienți activi</b> · ~' + Math.round((period === 'month' ? p.month : p.year / 12) / p.clients) + ' lei pe client pe lună</div>' +
          '<ul><li>Planuri alimentare automate pe 7 zile</li><li>Calorii și macro setate de tine</li><li>Meniu făcut de tine, când vrei</li><li>Check-in cu poze, greutate, chat</li></ul>' +
          '<p class="small muted" style="margin:0 0 10px">' + esc(p.note) + '</p>' + btn + '</div>';
      }).join('') + customHtml(b, me, email) + '</div>' +
      (ready ? '' : '<p class="msg msg-info">Plățile online se deschid în curând. Până atunci poți folosi programul în perioada de probă.</p>') +
      '<p class="small muted center" style="margin:0">Plata cu cardul, prin Stripe. Ai un cod de reducere? Îl scrii pe pagina de plată. Prețurile sunt finale (firma nu e plătitoare de TVA). Clienții arhivați nu se numără.</p>';
  }

  // planul la cerere: peste 50 de clienți
  function customHtml(b, me, email) {
    var mail = (App.config && App.config.CONTACT_EMAIL) || '';
    if (!mail) return '';
    var body = 'Bună,\n\nAș vrea o ofertă pentru peste 50 de clienți.\n\nNume: ' + (me.display_name || '') + '\nEmail cont: ' + (email || '') +
      '\nClienți activi acum: ' + b.used + '\nCâți clienți estimez: \nTelefon: \n\nMulțumesc!';
    var href = 'mailto:' + mail + '?subject=' + encodeURIComponent('Ofertă CoachMeal – peste 50 de clienți') + '&body=' + encodeURIComponent(body);
    return '<div class="plan custom"><h3>Peste 50</h3><div class="price">La cerere</div>' +
      '<div class="small muted">pentru <b style="color:#fff">peste 50 de clienți activi</b></div>' +
      '<ul><li>Tot ce e în celelalte planuri</li><li>Preț pe client mai mic</li><li>Plată lunară sau anuală</li></ul>' +
      '<p class="small muted" style="margin:0 0 10px">Îți răspundem pe email cu o ofertă.</p><a class="btn btn-block" href="' + esc(href) + '">Cere ofertă</a></div>';
  }

  function section(b, me, email) {
    var h = '<div class="row" style="margin-bottom:4px"><button type="button" class="linkbtn" data-bill="back">← Înapoi la clienți</button></div>' +
      '<section class="card"><h1 style="margin-bottom:6px">Abonament</h1><p class="muted" style="margin:0 0 10px">' + esc(statusLine(b)) + '</p>' +
      '<p style="margin:0"><b>' + NAMES[b.plan] + '</b> · ' + usedTxt(b) + '</p>' + (b.active ? meter(b) : '');
    if (paid(b)) {
      var pu = portalUrl(email);
      h += pu ? '<a class="btn btn-ghost" style="margin-top:14px" href="' + esc(pu) + '" target="_blank" rel="noopener">Card, facturi, schimbare sau anulare</a><p class="small muted" style="margin:8px 0 0">Se deschide pagina Stripe a abonamentului tău. Intri cu emailul folosit la plată.</p>' : '';
    }
    h += '</section><section class="card"><h2 style="text-align:center">' + (paid(b) ? 'Planurile' : 'Alege abonamentul') + '</h2>' + plansHtml(b, me, email) + '</section>';
    return h;
  }

  function bind(root, rerender) {
    root.addEventListener('click', function (e) {
      var p = e.target.closest('[data-per]');
      if (p) { period = p.getAttribute('data-per'); rerender(); }
    });
  }

  window.Billing = { bar: bar, section: section, bind: bind, NAMES: NAMES, paid: paid };
})();
