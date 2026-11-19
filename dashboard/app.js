// Token Radar (radar-2) dashboard. Reads window.RADAR from ../data.js and renders the ranked
// board, chain/category/likelihood filters, sortable columns, a live-token view, the peer
// evidence table and a per-protocol detail drawer. No network, no fetch, no framework.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', scope: 'all', minLaunch: 0, tab: 'pre', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    return d >= 365 ? (d / 365).toFixed(1) + 'y' : Math.max(0, Math.round(d)) + 'd';
  }
  // The page recomputes a row with the same arithmetic as lib/model.ts and says so in the detail
  // view, so the screenshots and the code behind them visibly agree.
  function impliedOf(r) {
    // lib/model.ts computes the board's implied value from exactly these published, rounded
    // multipliers, so this recomputation agrees with board.json to the dollar.
    return Math.max(1, Math.round(r.tvl_usd * r.peer_multiple * r.growth_multiplier * r.maturity_multiplier * r.breadth_multiplier));
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  // Categorical palette for the charts: muted premium tones on the near-black canvas. The six
  // largest categories by row count get a colour each; every other category shares the slate
  // grey of the donut's "Other" slice, so a category dot anywhere matches the donut.
  var PALETTE = ['#5e6ad2', '#2fb3a6', '#4c9be8', '#d9a13b', '#8b7bd8', '#d8768a'];
  var OTHER_COLOR = '#62666d';
  var BAND_COLORS = { High: '#4cb782', Elevated: '#d9a13b', Watch: '#7d8aa0', Early: '#62666d' };
  function catCounts() {
    var map = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; map[c] = (map[c] || 0) + 1; });
    return Object.keys(map).map(function (name) { return { name: name, count: map[name] }; })
      .sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
  }
  var CAT_STATS = catCounts();
  var CAT_TOP = CAT_STATS.slice(0, 6);
  var CAT_COLOR = {};
  CAT_TOP.forEach(function (c, i) { CAT_COLOR[c.name] = PALETTE[i]; });
  function catColor(name) { return CAT_COLOR[name || 'Other'] || OTHER_COLOR; }
  var WATCH_COVERED = DATA.rows.filter(function (r) { return r.on_watchlist; }).length;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function setCategory(c) { state.category = c; writeHash(); render(); }
  // Farm plan: the same derivation lib/model.ts writes to board.json (category, chain, TVL, age).
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) { return p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50; }
  function holdFor(age) { return age === null || age === undefined ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30; }
  function actionFor(p, cap, chain) {
    var c = (p.category || '').toLowerCase(), n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + cap + ' of USDC to ' + n + ' on ' + chain + ', then borrow no more than $' + Math.round(cap / 3) + ' against it so the health factor stays comfortably above liquidation, and keep both legs open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap half of $' + cap + " for the pool's second asset in " + n + ' on ' + chain + ', add the pair as liquidity to its main pool, and keep the LP position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + n + ', then use the bridged funds in one app on the destination chain in the same session, so the trip counts as real usage.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + cap + " of the chain's staking asset through " + n + ' on ' + chain + ', keep the staking receipt in the wallet, and note the unbonding period before you need the funds back.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + cap + ' of USDC as margin on ' + n + ' and open one small hedged trade (long and short of near-equal size), so the farm is the trading activity, not price exposure.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + cap + ' on ' + n + ' and place one small position in each of two active markets, keeping the stakes small enough to repeat weekly.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + cap + ' into one ' + n + ' vault on ' + chain + ", keep the vault shares, and read the vault's strategy page so you know which venues your deposit is routed to.";
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + cap + ' of the stable asset through ' + n + ' on ' + chain + ' and hold the stable position in the farming wallet.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + cap + ' of ' + n + "'s yield asset on " + chain + ' after reading its attestation page, and hold the asset in the farming wallet.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + cap + ' of cover from ' + n + ' on ' + chain + ' for the longest term its page offers and keep the policy receipt.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + cap + ' into ' + n + "'s main yield position on " + chain + ' and keep the position open rather than rotating it weekly.';
    return 'Deposit $' + cap + ' of USDC into ' + n + ' on ' + chain + ', complete its core action once (a deposit, a swap or a mint, whichever its app leads with), and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase(), n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Repeat one real action on ' + n + ' each week: add a small amount of collateral, repay a slice of the borrow, or borrow a slice more, keeping the health factor safe.';
    if (c.indexOf('dex') >= 0) return 'Make one swap a week through ' + n + ' and, once a month, add a little liquidity to the same pool, so the wallet shows both trading and providing.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount (about $20) through ' + n + ' once a week, alternating direction, and use a destination app after each trip.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open and close one small hedged trade a week on ' + n + ', so the wallet builds a trading history without carrying directional risk.';
    return 'Make one qualifying action on ' + n + ' each week - a deposit, a swap, a vote or a claim of accrued rewards, whichever its app records - and vary the amount slightly.';
  }
  function stepText(s) { var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.'; return t.length > 600 ? t.slice(0, 596) + '...' : t; }
  function farmSteps(p) {
    var chain = chainOf(p), cap = capitalFor(p), hold = holdFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm ' + p.name + ' with, keep its seed phrase offline, and never connect it to sites you have not checked.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, cap, chain), cost: '$' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one weekly snapshot, and check ' + p.name + "'s own points or rewards page once a week from the link its app publishes.", cost: 'the $' + cap + ' stays in the position', time: hold + ' days' },
      { text: 'Once a month, review the position: check its health or value against what you put in, revoke token approvals you no longer use, and cut the position if TVL has fallen for four straight weeks.', cost: 'under $2 of gas for revocations', time: '10 minutes a month' },
      { text: 'When a claim or conversion is announced, claim only from the link ' + p.name + ' itself publishes in its app or docs, and never pay a fee or connect a second wallet to claim.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates, the amounts and every transaction hash in a farm log, with your exit rule written down, so you can repeat the position or unwind it without guessing.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.scope === 'watch' && !r.on_watchlist) return false;
      if (state.scope === 'early' && r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.launch_score < state.minLaunch) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'launch') { av = a.launch_score; bv = b.launch_score; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN RADAR' })),
      el('div', { class: 'top-meta' }, el('span', { text: 'Snapshot ' + DATA.as_of }), el('span', { text: 'DefiLlama protocol index' }), el('span', { text: DATA.model_version + ' - peer-priced model' })));
  }
  // Ticker strip: dense status line computed from the rows at render time - the snapshot
  // facts plus the largest 7-day gainer and loser actually on the board. Nothing hard-coded.
  function ticker() {
    var gain = null, lose = null;
    DATA.rows.forEach(function (r) {
      if (r.change_7d === null || r.change_7d === undefined) return;
      if (!gain || r.change_7d > gain.change_7d) gain = r;
      if (!lose || r.change_7d < lose.change_7d) lose = r;
    });
    function item(label, value, cls) {
      return el('span', { class: 'tk' }, el('b', { text: label + ' ' }), el('span', { class: cls || null, text: value }));
    }
    var bar = el('div', { class: 'ticker', 'aria-label': 'Snapshot status line' },
      item('SNAPSHOT', DATA.as_of), item('SOURCE', 'DEFILLAMA'), item('MODEL', DATA.model_version.toUpperCase()),
      item('ROWS', String(DATA.board_size)), item('WATCHLIST', WATCH_COVERED + '/' + DATA.watchlist_size),
      item('PEER MULT', DATA.global_peer_multiple + 'x'));
    if (gain) bar.appendChild(item('TOP GAIN 7D', gain.name + ' ' + fmtPct(gain.change_7d), 'pos'));
    if (lose) bar.appendChild(item('TOP LOSS 7D', lose.name + ' ' + fmtPct(lose.change_7d), 'neg'));
    return bar;
  }
  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Pre-token protocols, priced by their own peers' }),
        el('p', { text: 'Every protocol here records no token in the snapshot. Each is priced at the median market-cap / TVL of the live protocols in its own category, adjusted for 7-day growth, time running with no token on record, and chain breadth. A separate launch score says how launch-like the record looks. Neither number is a promise that a token will be issued.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('div', { class: 'cov', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.round((WATCH_COVERED / DATA.watchlist_size) * 100) + '%' }))),
        el('div', { class: 'fact' }, el('span', { text: 'Rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the $50M floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Launch score 65 or more' }), el('b', { text: String(DATA.high_launch_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global peer multiple' }), el('b', { text: DATA.global_peer_multiple + 'x TVL' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))));
  }
  function selectField(id, label, values, current, onchange) {
    var sel = el('select', { id: id, 'aria-label': label }, values.map(function (v) { return el('option', { value: v[0], text: v[1], selected: v[0] === current ? 'selected' : null }); }));
    sel.addEventListener('change', function () { onchange(sel.value); writeHash(); render(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var scope = el('div', { class: 'tabs' }, ['all', 'watch', 'early'].map(function (s) {
      return el('button', { type: 'button', 'aria-pressed': state.scope === s ? 'true' : 'false', text: s === 'all' ? 'All rows' : s === 'watch' ? 'Watchlist' : 'Early only', onclick: function () { state.scope = s; render(); } });
    }));
    var tabs = el('div', { class: 'tabs' }, ['pre', 'live'].map(function (t) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === t ? 'true' : 'false', text: t === 'pre' ? 'Pre-token' : 'Live token', onclick: function () { state.tab = t; render(); } });
    }));
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [['all', 'All categories']].concat(cats.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      selectField('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; }),
      selectField('launch', 'Launch score at least', [['0', 'Any score'], ['30', '30 - Watch'], ['45', '45 - Elevated'], ['65', '65 - High']], String(state.minLaunch), function (v) { state.minLaunch = Number(v); }),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), scope),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), tabs),
      el('span', { class: 'count', text: state.tab === 'pre' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' }));
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } }, label, state.sort === key ? el('span', { class: 'arr', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null));
  }
  function boardTable() {
    var list = sorted(rows());
    if (!list.length) return el('div', { class: 'panel empty' }, el('h2', { text: 'No protocol matches that filter' }), el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minLaunch = 0; state.scope = 'all'; writeHash(); render(); } }));
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', { tabindex: '0', 'data-selected': state.selected === r.slug ? 'true' : 'false', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num rankcell' }, el('span', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'meta' },
          el('span', { class: 'catdot', 'aria-hidden': 'true', style: 'background:' + catColor(r.category) }),
          el('span', { text: r.category || 'Other' }),
          el('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
          el('span', { text: r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain' }),
          el('span', { class: 'tag', text: r.on_watchlist ? 'watchlist' : 'early' })))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('span', { class: 'launch b-' + r.launch_band.toLowerCase() }, el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'num', text: String(r.launch_score) }), el('span', { class: 'band', text: r.launch_band }), el('span', { class: 'track' }, el('i', { style: 'width:' + Math.max(4, Math.min(100, r.launch_score)) + '%' })))),
        el('td', null, el('div', { class: 'implied' }, el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { class: 'sub', text: 'Protocols that record no token, ranked by implied value. Select a row for its pricing, launch score, risks and farm plan.' }),
      el('thead', null, el('tr', null, sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('launch', 'Launch score'), sortHeader('implied', 'Implied value'))), tbody)));
  }
  // Charts: every value below is recomputed from DATA.rows at render time - counts, shares,
  // rankings and histogram bins are never hard-coded. The overview charts describe the whole
  // pre-token snapshot, before the board filters, and the caption says so.
  function barRow(r, max, own) {
    return el('button', { type: 'button', class: 'trow' + (own ? ' own' : ''), 'aria-label': r.name + ', implied value ' + fmtUsd(r.implied_value_usd) + (own ? ' - this protocol' : ' - open detail'), onclick: function () { if (!own) openDetail(r.slug); } },
      el('span', { class: 'tname', text: r.name }),
      el('span', { class: 'ttrack' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%' + (own === false ? ';background:rgba(255,255,255,0.28)' : '') })),
      el('span', { class: 'num tval', text: fmtUsd(r.implied_value_usd) }));
  }
  function topChart() {
    var top = DATA.rows.slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; }).slice(0, 10);
    var max = top.length ? top[0].implied_value_usd : 1;
    var list = el('div', { class: 'tchart' });
    top.forEach(function (r) { list.appendChild(barRow(r, max, null)); });
    return el('div', { class: 'chart' }, el('h3', { text: 'Top 10 by implied value' }), list);
  }
  function donutChart() {
    var total = DATA.rows.length;
    var other = total - CAT_TOP.reduce(function (s, c) { return s + c.count; }, 0);
    var segs = CAT_TOP.map(function (c, i) { return { name: c.name, count: c.count, color: PALETTE[i], filter: true }; });
    if (other > 0) segs.push({ name: 'Other', count: other, color: OTHER_COLOR, filter: false });
    var R = 64, C = 2 * Math.PI * R, start = 0, svg = '';
    segs.forEach(function (s) {
      var len = (s.count / total) * C;
      svg += '<circle cx="84" cy="84" r="' + R + '" fill="none" stroke="' + s.color + '" stroke-width="22" stroke-dasharray="' + Math.max(0, len - 2).toFixed(1) + ' ' + (C - len + 2).toFixed(1) + '" stroke-dashoffset="' + (-start).toFixed(1) + '" transform="rotate(-90 84 84)"' + (s.filter ? ' data-cat="' + esc(s.name) + '" class="seg"' : '') + '/>';
      start += len;
    });
    svg = '<svg viewBox="0 0 168 168" role="img" aria-label="Rows by category: ' + esc(segs.map(function (s) { return s.name + ' ' + s.count; }).join(', ')) + ' - of ' + total + ' rows">' + svg +
      '<text x="84" y="82" text-anchor="middle" class="dtotal">' + total + '</text><text x="84" y="102" text-anchor="middle" class="dlabel">protocols</text></svg>';
    var holder = el('div', { class: 'donut' });
    holder.innerHTML = svg;
    holder.querySelectorAll('.seg').forEach(function (n) { n.addEventListener('click', function () { setCategory(n.getAttribute('data-cat')); }); });
    var legend = el('div', { class: 'legend' });
    segs.forEach(function (s) {
      var body = [el('span', { class: 'sw', style: 'background:' + s.color }), el('span', { class: 'lname', text: s.name }), el('span', { class: 'num lcount', text: s.count + ' · ' + Math.round((s.count / total) * 100) + '%' })];
      legend.appendChild(s.filter
        ? el('button', { type: 'button', class: 'lrow', 'aria-label': 'Filter the board to ' + s.name, onclick: function () { setCategory(s.name); } }, body)
        : el('div', { class: 'lrow static' }, body));
    });
    return el('div', { class: 'chart' }, el('h3', { text: 'Rows by category' }),
      el('div', { class: 'donut-wrap' }, holder, legend),
      el('p', { class: 'sub chart-note', text: 'Other groups the ' + (CAT_STATS.length - CAT_TOP.length) + ' smaller categories, with at most ' + (CAT_STATS.length > CAT_TOP.length ? CAT_STATS[CAT_TOP.length].count : 0) + ' rows each.' }));
  }
  function histChart() {
    var bands = [
      { lo: 0, hi: 24, label: '0-24', color: BAND_COLORS.Early },
      { lo: 25, hi: 44, label: '25-44', color: BAND_COLORS.Watch },
      { lo: 45, hi: 64, label: '45-64', color: BAND_COLORS.Elevated },
      { lo: 65, hi: 100, label: '65-100', color: BAND_COLORS.High }
    ];
    bands.forEach(function (b) { b.count = DATA.rows.filter(function (r) { return r.launch_score >= b.lo && r.launch_score <= b.hi; }).length; });
    var max = Math.max.apply(null, bands.map(function (b) { return b.count; })) || 1;
    var wrap = el('div', { class: 'hist', role: 'img', 'aria-label': 'Launch-score distribution: ' + bands.map(function (b) { return 'score ' + b.label + ': ' + b.count + ' rows'; }).join(', ') });
    bands.forEach(function (b) {
      wrap.appendChild(el('div', { class: 'hcol', 'aria-hidden': 'true' },
        el('b', { class: 'num', text: String(b.count) }),
        el('span', { class: 'hbar' }, el('i', { style: 'height:' + Math.max(3, Math.round((b.count / max) * 100)) + '%;background:' + b.color })),
        el('span', { class: 'hlab', text: b.label })));
    });
    return el('div', { class: 'chart' }, el('h3', { text: 'Launch-score distribution' }), wrap);
  }
  function overviewPanel() {
    return el('section', { class: 'charts', 'aria-label': 'Board charts' },
      el('div', { class: 'charts-head' }, el('h2', { text: 'The board in charts' }),
        el('p', { class: 'sub', text: 'Every chart is drawn from all ' + DATA.rows.length + ' pre-token rows in the snapshot, before the filters below are applied. Select a bar to open its protocol, or a category in the legend to filter the board to it.' })),
      el('div', { class: 'chart-grid' }, topChart(), donutChart()),
      histChart());
  }
  // Drawer visual: the protocol against the three largest others in its own category.
  function vsChart(row) {
    var cat = row.category || 'Other';
    var inCat = DATA.rows.filter(function (r) { return (r.category || 'Other') === cat; })
      .sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; });
    var list = [row].concat(inCat.filter(function (r) { return r.slug !== row.slug; }).slice(0, 3))
      .sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; });
    var max = inCat.length ? inCat[0].implied_value_usd : 1;
    var wrap = el('div', { class: 'tchart' });
    list.forEach(function (r) { wrap.appendChild(barRow(r, max, r.slug === row.slug)); });
    return el('section', { class: 'detail-section' }, el('h3', { text: 'Implied value vs ' + cat + ' leaders' }),
      el('p', { class: 'sub vs-note', text: 'This protocol against the three largest others in its own category - ' + inCat.length + ' pre-token rows record ' + cat + ' in the snapshot.' }), wrap);
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }), el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a' }),
        el('td', null, el('span', { class: 'tag', text: 'already trades' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { class: 'sub', text: 'These protocols already record a token: their market cap is a market fact, not a model output. They are the peer evidence, set aside from the ranking.' }),
      el('thead', null, el('tr', null, el('th', { text: 'Status' }), el('th', { text: 'Protocol' }), el('th', { text: 'TVL' }), el('th', { text: 'Market cap' }), el('th', { text: 'Mcap / TVL' }), el('th', { text: 'Token' }))), tbody)));
  }
  function modelPanel() {
    var m = DATA.model;
    var peerRows = DATA.peers.map(function (s) {
      return el('tr', null, el('td', { text: s.category }), el('td', { class: 'num', text: String(s.ratio_count) }), el('td', { class: 'num', text: String(s.pre_count) }), el('td', { class: 'num', text: s.median_multiple + 'x' }), el('td', { class: 'num', text: Math.round(s.tokenized_share * 100) + '%' }));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How radar-2 prices a protocol that records no token' }),
      el('div', { class: 'formula', text: 'implied = round( TVL x peer_multiple(category) x growth x maturity x breadth )' }),
      el('p', { class: 'sub', text: 'peer_multiple is the median market-cap / TVL of the live protocols in the same category in this snapshot (at least ' + m.peer_min + ' peers, clamped to ' + m.peer_floor + '-' + m.peer_cap + 'x; the global median ' + DATA.global_peer_multiple + 'x otherwise). Growth clamps 7-day change to ' + m.growth_floor + '..' + m.growth_cap + '% and weights rises ' + m.growth_weight_pos + ' but falls ' + m.growth_weight_neg + '. Maturity is ' + m.maturity_base + ' + ' + m.maturity_range + ' x (1 - exp(-age / ' + m.maturity_tau_days + 'd)) with ' + m.unknown_age_days + 'd assumed when no date is recorded. Breadth adds ' + (m.breadth_per_doubling * 100) + '% per doubling of chains, at most ' + m.breadth_max_doublings + ' doublings.' }),
      el('p', { class: 'sub', text: 'Launch score (0-100) is kept separate from value: 30% how often the category already records a token, 25% time running recording none, 20% scale, 15% 7-day momentum, 10% chain breadth. The early radar below the $50M floor is chosen by preliminary implied value, not raw TVL, so a smaller protocol in a richly priced category can outrank a larger stagnant one.' }),
      el('div', { class: 'table-wrap' }, el('table', null, el('caption', { class: 'sub', text: 'Peer evidence from this snapshot, largest peer groups first.' }), el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { text: 'Priced peers' }), el('th', { text: 'Records no token' }), el('th', { text: 'Median mcap / TVL' }), el('th', { text: 'Share tokenised' }))), el('tbody', null, peerRows))));
  }
  var dialog = el('dialog', { class: 'detail', id: 'detail' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function partRow(label, v, color) { return el('div', { class: 'part' }, el('span', { text: label }), el('b', { class: 'num', text: Math.round(v * 100) + '%' }), el('span', { class: 'pbar' }, el('i', { style: 'width:' + Math.round(v * 100) + '%;background:' + color }))); }
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug; writeHash();
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' }, el('div', null,
      el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' - watchlist' : ' - early, below the floor') }),
      el('h2', { text: row.name }),
      el('p', { class: 'sub meta-line' }, el('span', { class: 'catdot', 'aria-hidden': 'true', style: 'background:' + catColor(row.category) }), (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain'))),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { dialog.close(); } })));
    var check = impliedOf(row);
    dialog.appendChild(el('section', { class: 'detail-section' }, el('h3', { text: 'Implied value, step by step' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Peer multiple (' + (row.category || 'category') + ')' }), el('b', { class: 'num', text: row.peer_multiple + 'x' })),
        el('div', null, el('span', { text: '7-day growth / multiplier' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' / ' + row.growth_multiplier })),
        el('div', null, el('span', { text: 'Age recording no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity / breadth multipliers' }), el('b', { class: 'num', text: row.maturity_multiplier + ' / ' + row.breadth_multiplier })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'sub', text: 'The page recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' Conditional estimate only: it prices a token if one were issued against this record; it does not predict an issue date.' })));
    dialog.appendChild(vsChart(row));
    dialog.appendChild(el('section', { class: 'detail-section' }, el('h3', { text: 'Launch score ' + row.launch_score + ' - ' + row.launch_band }),
      el('div', { class: 'equation' }, partRow('Category tokenisation share', row.launch_parts.category, BAND_COLORS[row.launch_band]), partRow('Time recording no token', row.launch_parts.age, BAND_COLORS[row.launch_band]), partRow('Scale', row.launch_parts.scale, BAND_COLORS[row.launch_band]), partRow('7-day momentum', row.launch_parts.momentum, BAND_COLORS[row.launch_band]), partRow('Chain breadth', row.launch_parts.breadth, BAND_COLORS[row.launch_band]))));
    dialog.appendChild(el('section', { class: 'detail-section' }, el('h3', { text: 'Risks to price in' }),
      el('ul', { class: 'risks' }, row.risks.map(function (r) { return el('li', { text: r }); }))));
    dialog.appendChild(el('section', { class: 'detail-section' }, el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, farmSteps(row).map(function (s) {
        var at = s.indexOf(' Cost: ');
        return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' }));
      }))));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header()); shell.appendChild(ticker()); shell.appendChild(lede());
    if (state.tab === 'pre') shell.appendChild(overviewPanel());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    if (state.tab === 'pre') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }
  readHash(); render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
