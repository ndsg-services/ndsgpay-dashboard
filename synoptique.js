/* synoptique.js — affichage d'un schéma synoptique (blocs + flèches) cliquable.
 *
 * Ce fichier est PUBLIC et ne contient AUCUNE donnée : il sait seulement dessiner la configuration qu'on lui donne.
 *   - docs.html lui donne le schéma public (écrit dans la page, sans pawaPay ni détail technique) ;
 *   - admin.html lui donne le schéma interne, chargé depuis GET /api/admin/schema avec la clé admin.
 *
 *   NDSGSyn.mount(element, cfg)
 *   cfg = { W, H, caption, first, nodes: [{ id, k:'actor'|'cont'|undefined, t, s, x, y, w, h, d:{ k, x, f:[], r:[] } }],
 *           edges: [{ from, to, p:[[x,y],…], l, lx, ly, a }] }
 *   t et s : lignes séparées par « | ». k='cont' : conteneur en pointillés. d : détail affiché sous le schéma.
 */
(function () {
  'use strict';
  var CSS = '' +
    '.nsyn{--n-ink:var(--text,#1a1a18);--n-mut:var(--text-muted,var(--muted,#6b6b65));--n-line:var(--border-strong,rgba(26,26,24,.18));--n-soft:var(--cream-dark,#E8E4DC);--n-acc:var(--blue,#1A5FB4);--n-accl:var(--blue-light,#EAF1FB);font-family:var(--sans,sans-serif);color:var(--n-ink)}' +
    '.nsyn-box{overflow-x:auto;background:#fff;border:1px solid var(--n-line);border-radius:12px;padding:8px}' +
    '.nsyn-svg{display:block;width:100%;min-width:860px;height:auto}' +
    '.nsyn-svg .cont{fill:none;stroke:var(--n-mut);stroke-dasharray:5 5;stroke-width:1.2}' +
    '.nsyn-svg .ct{fill:var(--n-mut);font:600 12px var(--sans,sans-serif);letter-spacing:.06em;text-transform:uppercase}' +
    '.nsyn-svg .nd{cursor:pointer;outline:none}' +
    '.nsyn-svg .nd rect{fill:#fff;stroke:var(--n-line);stroke-width:1.2}' +
    '.nsyn-svg .nd.actor rect{fill:var(--n-soft)}' +
    '.nsyn-svg .nd:hover rect,.nsyn-svg .nd:focus-visible rect{stroke:var(--n-mut)}' +
    '.nsyn-svg .nd.on rect{stroke:var(--n-acc);stroke-width:2.4}' +
    '.nsyn-svg .nt{fill:var(--n-ink);font:600 13px var(--sans,sans-serif);text-anchor:middle}' +
    '.nsyn-svg .ns{fill:var(--n-mut);font:400 11px var(--sans,sans-serif);text-anchor:middle}' +
    '.nsyn-svg .e{stroke:var(--n-mut);stroke-width:1.6;fill:none;stroke-linejoin:round}' +
    '.nsyn-svg .e.on{stroke:var(--n-acc);stroke-width:2.6}' +
    '.nsyn-svg .el{fill:var(--n-ink);font:500 11.5px var(--sans,sans-serif)}' +
    '.nsyn-svg .e.on + .el{fill:var(--n-acc);font-weight:600}' +
    '.nsyn-svg .mk{fill:var(--n-mut)}.nsyn-svg .mkon{fill:var(--n-acc)}' +
    '.nsyn-hint{display:none;margin:6px 4px 0;font-size:12px;color:var(--n-mut)}' +
    '@media (max-width:900px){.nsyn-hint{display:block}}' +
    '.nsyn-cap{margin:10px 2px 0;font-size:13px;color:var(--n-mut);line-height:1.5}' +
    '.nsyn-detail{margin-top:14px;background:#fff;border:1px solid var(--n-line);border-radius:12px;padding:16px 18px}' +
    '.nsyn-pill{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--n-acc);background:var(--n-accl);padding:2px 8px;border-radius:20px}' +
    '.nsyn-detail h3{font-family:var(--serif,Georgia,serif);font-weight:500;font-size:18px;margin:8px 0 6px}' +
    '.nsyn-detail p{font-size:14px;line-height:1.55;color:var(--n-ink)}' +
    '.nsyn-kv{margin-top:12px;font-size:11px;color:var(--n-mut);text-transform:uppercase;letter-spacing:.06em;font-weight:600}' +
    '.nsyn-detail code{font-family:var(--mono,monospace);font-size:12px;background:var(--n-soft);padding:1px 6px;border-radius:4px;display:inline-block;margin:3px 4px 0 0}';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function injectCss() {
    if (document.getElementById('nsyn-css')) return;
    var st = document.createElement('style'); st.id = 'nsyn-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  function mount(el, cfg) {
    if (!el || !cfg || !Array.isArray(cfg.nodes) || !Array.isArray(cfg.edges)) throw new Error('synoptique : configuration invalide');
    injectCss();
    var uid = 'nsyn' + Math.random().toString(36).slice(2, 7);
    el.classList.add('nsyn');
    el.innerHTML = '<div class="nsyn-box" tabindex="0" aria-label="Schéma, défilement horizontal possible"><svg class="nsyn-svg" role="img"></svg></div>' +
      '<p class="nsyn-hint">Faites glisser le schéma vers la gauche pour voir la suite.</p><p class="nsyn-cap"></p><div class="nsyn-detail" aria-live="polite"></div>';
    var svg = el.querySelector('.nsyn-svg'), cap = el.querySelector('.nsyn-cap'), det = el.querySelector('.nsyn-detail');
    var sel = cfg.first || null;
    var byId = {}; cfg.nodes.forEach(function (n) { byId[n.id] = n; });

    function nodeSvg(n) {
      var lines = String(n.t || '').split('|'), subs = String(n.s || '').split('|').filter(Boolean), cx = n.x + n.w / 2;
      var total = lines.length * 16 + subs.length * 14, y = n.y + (n.h - total) / 2 + 12;
      var g = '<g class="nd' + (n.k === 'actor' ? ' actor' : '') + (n.id === sel ? ' on' : '') + '" data-id="' + esc(n.id) + '" tabindex="0" role="button" aria-label="' + esc(String(n.t).replace('|', ' ')) + '"><rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="9"/>';
      lines.forEach(function (l) { g += '<text class="nt" x="' + cx + '" y="' + y + '">' + esc(l) + '</text>'; y += 16; });
      subs.forEach(function (l) { g += '<text class="ns" x="' + cx + '" y="' + y + '">' + esc(l) + '</text>'; y += 14; });
      return g + '</g>';
    }
    function draw() {
      var s = '<defs><marker id="' + uid + 'a" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0 0L10 5L0 10z" class="mk"/></marker>' +
        '<marker id="' + uid + 'b" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M0 0L10 5L0 10z" class="mkon"/></marker></defs>';
      cfg.nodes.filter(function (n) { return n.k === 'cont'; }).forEach(function (n) {
        s += '<g class="nd' + (n.id === sel ? ' on' : '') + '" data-id="' + esc(n.id) + '" tabindex="0" role="button" aria-label="' + esc(n.t) + '"><rect class="cont" x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="14"/><text class="ct" x="' + (n.x + 16) + '" y="' + (n.y + 20) + '">' + esc(n.t) + '</text></g>';
      });
      cfg.nodes.filter(function (n) { return n.k !== 'cont'; }).forEach(function (n) { s += nodeSvg(n); });
      cfg.edges.forEach(function (e) {
        var on = sel && (e.from === sel || e.to === sel);
        s += '<polyline class="e' + (on ? ' on' : '') + '" points="' + e.p.map(function (q) { return q.join(','); }).join(' ') + '" marker-end="url(#' + uid + (on ? 'b' : 'a') + ')"/>' +
          '<text class="el" x="' + e.lx + '" y="' + e.ly + '" text-anchor="' + esc(e.a || 'middle') + '">' + esc(e.l) + '</text>';
      });
      return s;
    }
    function detail() {
      var n = byId[sel]; if (!n) { det.innerHTML = ''; return; }
      var d = n.d || {}, nm = String(n.t).replace('|', ' ');
      det.innerHTML = '<span class="nsyn-pill">' + esc(d.k || (n.k === 'actor' ? 'Acteur' : n.k === 'cont' ? 'Plateforme' : 'Module')) + '</span><h3>' + esc(nm) + '</h3><p>' + esc(d.x || '') + '</p>' +
        (d.f && d.f.length ? '<div class="nsyn-kv">Fichiers</div>' + d.f.map(function (x) { return '<code>' + esc(x) + '</code>'; }).join('') : '') +
        (d.r && d.r.length ? '<div class="nsyn-kv">Routes</div>' + d.r.map(function (x) { return '<code>' + esc(x) + '</code>'; }).join('') : '');
    }
    function render(focusId) {
      svg.setAttribute('viewBox', '0 0 ' + cfg.W + ' ' + cfg.H); svg.setAttribute('aria-label', cfg.caption || '');
      cap.textContent = cfg.caption || ''; svg.innerHTML = draw(); detail();
      if (focusId) { var g = svg.querySelector('.nd[data-id="' + focusId.replace(/"/g, '') + '"]'); if (g) g.focus(); }
    }
    function pick(id) { sel = id; render(id); }
    svg.addEventListener('click', function (e) { var g = e.target.closest && e.target.closest('.nd'); if (g) pick(g.getAttribute('data-id')); });
    svg.addEventListener('keydown', function (e) { var g = e.target.closest && e.target.closest('.nd'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(g.getAttribute('data-id')); } });
    render();
    return { select: pick };
  }

  window.NDSGSyn = { mount: mount };
})();
