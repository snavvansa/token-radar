// Token Radar page, part 3: inline SVG charts. UI.scatter: traded tokens' cap vs TVL, the fitted curve,
// the walk-forward hold-out, optionally one protocol on the curve. UI.calibration: held-out odds vs observed.
(function () {
  'use strict';
  var UI = window.UI, D = UI.D, M = D.model, NS = ['http', '//www.w3.org/2000/svg'].join(':'); // the SVG namespace id, built so no address literal sits in source
  function s(tag, at, text) { var n = document.createElementNS(NS, tag); Object.keys(at || {}).forEach(function (k) { n.setAttribute(k, at[k]); }); if (text !== undefined) n.textContent = text; return n; }
  function frame(w, h) { return s('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', role: 'img' }); }
  function axis(g, x0, y0, x1, y1, ticksX, ticksY, sx, sy, lx, ly) {
    g.appendChild(s('rect', { x: x0, y: y1, width: x1 - x0, height: y0 - y1, fill: 'none', stroke: '#22314d' }));
    ticksX.forEach(function (t) { var x = sx(t[0]); g.appendChild(s('line', { x1: x, x2: x, y1: y0, y2: y1, stroke: '#18243a' })); g.appendChild(s('text', { x: x, y: y0 + 13, 'text-anchor': 'middle', class: 'ax' }, t[1])); });
    ticksY.forEach(function (t) { var y = sy(t[0]); g.appendChild(s('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: '#18243a' })); g.appendChild(s('text', { x: x0 - 5, y: y + 3, 'text-anchor': 'end', class: 'ax' }, t[1])); });
    g.appendChild(s('text', { x: (x0 + x1) / 2, y: y0 + 27, 'text-anchor': 'middle', class: 'al' }, lx));
    g.appendChild(s('text', { x: 11, y: (y0 + y1) / 2, 'text-anchor': 'middle', class: 'al', transform: 'rotate(-90 11 ' + (y0 + y1) / 2 + ')' }, ly));
  }
  var DOLLAR = [[1e6, '$1M'], [1e7, '$10M'], [1e8, '$100M'], [1e9, '$1B'], [1e10, '$10B']];

  UI.scatter = function (hl, W, H) {
    W = W || 420; H = H || 270; var x0 = 56, x1 = W - 8, y1 = 8, y0 = H - 34;
    var pts = UI.TRADED, lo = Math.log(4e6), hi = Math.log(4e10), mlo = Math.log(3e5), mhi = Math.log(1e11);
    var sx = function (v) { return x0 + (Math.log(v) - lo) / (hi - lo) * (x1 - x0); }, sy = function (v) { return y0 - (Math.log(v) - mlo) / (mhi - mlo) * (y0 - y1); };
    var svg = frame(W, H), g = s('g'); svg.appendChild(g);
    axis(g, x0, y0, x1, y1, DOLLAR.slice(0, 5).filter(function (t) { return t[0] >= 4e6; }), DOLLAR.concat([[1e11, '$100B']]), sx, sy, 'TVL (log)', 'Market cap (log)');
    // the fitted curve at the median age, no family flag: every other term held at its middle
    var ages = pts.map(function (f) { return f.y; }).sort(function (a, b) { return a - b; }), ym = ages[ages.length >> 1], path = '';
    for (var i = 0; i <= 40; i++) {
      var tv = Math.exp(lo + (hi - lo) * i / 40), f = { z: Math.log(tv / 1e8), y: ym, fam: 0, g: 0, ch: 0, cat: '' };
      path += (i ? 'L' : 'M') + sx(tv).toFixed(1) + ' ' + sy(Math.max(Math.exp(mlo), UI.launchOf(f))).toFixed(1);
    }
    pts.forEach(function (f) {
      var tv = Math.min(Math.max(f.p.tvl_usd, 4e6), 4e10), mc = Math.min(Math.max(f.p.mcap_usd, 3e5), 1e11), held = f.listed !== null && f.listed >= M.walk_cut;
      g.appendChild(s('circle', { cx: sx(tv).toFixed(1), cy: sy(mc).toFixed(1), r: 3.6, fill: held ? '#f5b84b' : '#3ee6a8', 'fill-opacity': held ? 0.9 : 0.45 }));
    });
    g.appendChild(s('path', { d: path, fill: 'none', stroke: '#e8eef8', 'stroke-width': 2 }));
    if (hl) {
      var hx = sx(Math.min(Math.max(hl.tvl_usd, 4e6), 4e10)), hy = sy(hl.launch_value_usd);
      g.appendChild(s('circle', { cx: hx, cy: hy, r: 7, fill: 'none', stroke: '#a78bfa', 'stroke-width': 2.5 }));
      g.appendChild(s('text', { x: hx + 10, y: hy - 8, class: 'hl' }, hl.name + ' ' + UI.usd(hl.launch_value_usd)));
    }
    var key = s('g', { transform: 'translate(' + (x0 + 8) + ' ' + (y1 + 12) + ')' });
    [['#3ee6a8', 'fitted on (listed before ' + M.walk_cut + ')'], ['#f5b84b', 'walk-forward hold-out']].forEach(function (k, j) { key.appendChild(s('circle', { cx: 4, cy: j * 14, r: 4, fill: k[0] })); key.appendChild(s('text', { x: 12, y: j * 14 + 4, class: 'ax' }, k[1])); });
    key.appendChild(s('line', { x1: 0, x2: 9, y1: 28, y2: 28, stroke: '#e8eef8', 'stroke-width': 2 })); key.appendChild(s('text', { x: 12, y: 32, class: 'ax' }, 'fitted curve, median age'));
    g.appendChild(key);
    return svg;
  };

  UI.calibration = function () {
    var W = 260, H = 270, x0 = 42, x1 = W - 8, y1 = 8, y0 = H - 34, sx = function (v) { return x0 + v * (x1 - x0); }, sy = function (v) { return y0 - v * (y0 - y1); };
    var svg = frame(W, H), g = s('g'); svg.appendChild(g);
    var t = [[0, '0'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']];
    axis(g, x0, y0, x1, y1, t, t, sx, sy, 'Held-out predicted odds', 'Share that record a token');
    g.appendChild(s('line', { x1: sx(0), y1: sy(0), x2: sx(1), y2: sy(1), stroke: '#5f7090', 'stroke-dasharray': '4 4' }));
    var path = '';
    M.calibration.forEach(function (b, i) {
      path += (i ? 'L' : 'M') + sx(b.p).toFixed(1) + ' ' + sy(b.y).toFixed(1);
      g.appendChild(s('circle', { cx: sx(b.p).toFixed(1), cy: sy(b.y).toFixed(1), r: 2 + Math.sqrt(b.n) / 3, fill: '#a78bfa', 'fill-opacity': 0.8 }));
    });
    g.appendChild(s('path', { d: path, fill: 'none', stroke: '#a78bfa', 'stroke-width': 1.5 }));
    return svg;
  };
})();
