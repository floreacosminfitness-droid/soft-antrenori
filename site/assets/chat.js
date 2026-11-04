// Chatul dintre antrenor și un client. Același modul pe ambele părți.
// Chat.mount(el, { clientId, asTrainer, otherName, readOnly, onRead })
(function () {
  var App = window.App, sb = App.sb, esc = App.esc;
  var C = null, timer = null;

  function when(iso) {
    var d = new Date(iso), now = new Date();
    var t = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return t;
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'ieri, ' + t;
    return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) + ', ' + t;
  }
  function mine(m) { return m.from_trainer === C.asTrainer; }

  function listHtml() {
    if (!C.msgs.length) return '<p class="muted small chat-empty">' + (C.asTrainer ? 'Niciun mesaj încă. Scrie-i primul.' : 'Niciun mesaj încă. Ai o întrebare despre plan? Scrie-i aici antrenorului.') + '</p>';
    return C.msgs.map(function (m) {
      return '<div class="chat-m' + (mine(m) ? ' me' : '') + '"><div class="chat-b">' + esc(m.body).replace(/\n/g, '<br>') + '</div><div class="chat-t">' + when(m.created_at) + (mine(m) && m.read_at ? ' · citit' : '') + '</div></div>';
    }).join('');
  }
  function render() {
    if (C.collapsed && !C.opened) {
      C.root.innerHTML = '<section class="card chat"><div class="row"><h2 style="margin:0">Mesaje cu ' + esc(C.otherName) + '</h2>' + (C.unread ? '<span class="badge badge-msg">' + C.unread + (C.unread === 1 ? ' mesaj nou' : ' mesaje noi') + '</span>' : '') + '<div class="spacer"></div><button type="button" class="btn btn-ghost btn-sm" data-chat="open">' + (C.msgs.length ? 'Deschide conversația' : 'Scrie-i antrenorului') + '</button></div></section>';
      return;
    }
    C.root.innerHTML = '<section class="card chat"><h2>' + (C.asTrainer ? 'Mesaje' : 'Mesaje cu ' + esc(C.otherName)) + '</h2>' +
      '<div class="chat-list" id="chatList">' + listHtml() + '</div>' +
      (C.readOnly ? '<p class="msg msg-warn" style="margin:10px 0 0">' + esc(C.readOnly) + '</p>' :
        '<form class="chat-form" id="chatForm"><textarea id="chatIn" rows="2" maxlength="2000" placeholder="Scrie un mesaj…"></textarea><button class="btn" type="submit">Trimite</button></form>') +
      '<p class="msg" id="chatMsg" hidden></p></section>';
    scrollEnd();
  }
  function scrollEnd() { var l = document.getElementById('chatList'); if (l) l.scrollTop = l.scrollHeight; }
  function refreshList() {
    var l = document.getElementById('chatList'); if (!l) return;
    var atEnd = l.scrollHeight - l.scrollTop - l.clientHeight < 40;
    l.innerHTML = listHtml(); if (atEnd) scrollEnd();
  }

  async function load() {
    var mark = !C.collapsed || C.opened;
    var r = await sb.from('messages').select('id,from_trainer,body,created_at,read_at').eq('client_id', C.clientId).order('created_at', { ascending: false }).limit(200);
    if (r.error) return;
    C.msgs = r.data.reverse();
    // marchează ca citite mesajele primite
    var unread = C.msgs.filter(function (m) { return !mine(m) && !m.read_at; });
    C.unread = unread.length;
    if (unread.length && mark) {
      var ids = unread.map(function (m) { return m.id; });
      var up = await sb.from('messages').update({ read_at: new Date().toISOString() }).in('id', ids);
      if (!up.error) { unread.forEach(function (m) { m.read_at = new Date().toISOString(); }); C.unread = 0; if (C.onRead) C.onRead(); }
    }
  }

  async function send(e) {
    e.preventDefault();
    var ta = document.getElementById('chatIn'), text = (ta.value || '').trim();
    if (!text) return;
    var btn = e.target.querySelector('button'); btn.disabled = true;
    var r = await sb.from('messages').insert({ client_id: C.clientId, from_trainer: C.asTrainer, body: text }).select('id,from_trainer,body,created_at,read_at').single();
    btn.disabled = false;
    if (r.error) return App.msg(document.getElementById('chatMsg'), App.ro(r.error));
    App.msg(document.getElementById('chatMsg'), '');
    C.msgs.push(r.data); ta.value = ''; refreshList(); scrollEnd(); ta.focus();
  }

  async function poll() {
    if (!C || !document.body.contains(C.root) || document.hidden) return;
    var before = C.msgs.length && C.msgs[C.msgs.length - 1].id, readBefore = C.msgs.filter(function (m) { return m.read_at; }).length;
    await load();
    var after = C.msgs.length && C.msgs[C.msgs.length - 1].id, readAfter = C.msgs.filter(function (m) { return m.read_at; }).length;
    if (C.collapsed && !C.opened) return render();
    if (before !== after || readBefore !== readAfter) refreshList();
  }

  async function mount(root, opts) {
    clearInterval(timer);
    C = Object.assign({ root: root, msgs: [] }, opts);
    root.innerHTML = '<section class="card chat"><h2>Mesaje</h2><p class="muted small">Se încarcă…</p></section>';
    await load(); render();
    root.onclick = async function (e) { if (e.target.closest('[data-chat=open]')) { C.opened = true; await load(); render(); var t = document.getElementById('chatIn'); if (t) t.focus(); } };
    root.onsubmit = function (e) { if (e.target.id === 'chatForm') send(e); };
    root.onkeydown = function (e) { if (e.target.id === 'chatIn' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); var f = document.getElementById('chatForm'); if (f) f.requestSubmit(); } };
    timer = setInterval(poll, 15000);
  }
  function stop() { clearInterval(timer); C = null; }

  window.Chat = { mount: mount, stop: stop };
})();
