// RadarStats: ridge least squares, ridge logistic (Newton), held-out scores. Shared by Node and the
// browser; fixed iterations, no randomness.
(function (root) {
  'use strict';

  function solve(A, b) {
    var n = b.length, M = A.map(function (row, i) { return row.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var p = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      var piv = M[c][c];
      if (Math.abs(piv) < 1e-12) throw new Error('singular system at column ' + c);
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var f = M[r][c] / piv;
        if (f === 0) continue;
        for (var k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map(function (row, i) { return row[n] / row[i]; });
  }

  function zeros(p) { var a = []; for (var i = 0; i < p; i++) a.push(0); return a; }
  function zeroMatrix(p) { var m = []; for (var i = 0; i < p; i++) m.push(zeros(p)); return m; }
  function dot(w, x) { var s = 0; for (var j = 0; j < w.length; j++) s += w[j] * x[j]; return s; }
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

  // Ridge least squares: minimise sum (y - Xw)^2 + sum pen_j w_j^2 (pen 0 leaves a column free).
  function ridge(X, y, pen) {
    var p = pen.length, A = zeroMatrix(p), b = zeros(p);
    for (var i = 0; i < X.length; i++) {
      var x = X[i];
      for (var j = 0; j < p; j++) {
        if (x[j] === 0) continue;
        b[j] += x[j] * y[i];
        for (var k = 0; k < p; k++) A[j][k] += x[j] * x[k];
      }
    }
    for (j = 0; j < p; j++) A[j][j] += pen[j] + 1e-9;
    return solve(A, b);
  }

  // Ridge logistic regression, Newton's method, 25 fixed steps.
  function logistic(X, y, pen) {
    var p = pen.length, w = zeros(p);
    for (var it = 0; it < 25; it++) {
      var H = zeroMatrix(p), g = zeros(p);
      for (var i = 0; i < X.length; i++) {
        var x = X[i], mu = sigmoid(dot(w, x)), r = mu - y[i], v = Math.max(mu * (1 - mu), 1e-6);
        for (var j = 0; j < p; j++) {
          if (x[j] === 0) continue;
          g[j] += r * x[j];
          for (var k = 0; k < p; k++) H[j][k] += v * x[j] * x[k];
        }
      }
      for (j = 0; j < p; j++) { g[j] += pen[j] * w[j]; H[j][j] += pen[j] + 1e-9; }
      var step = solve(H, g);
      w = w.map(function (v, j) { return v - step[j]; });
    }
    return w;
  }

  function sorted(xs) { return xs.slice().sort(function (a, b) { return a - b; }); }
  function median(xs) {
    var s = sorted(xs), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function quantile(xs, q) {
    var s = sorted(xs), at = (s.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
    return s[lo] + (s[hi] - s[lo]) * (at - lo);
  }
  // Typical multiplicative miss: exp(median |log residual|); x2.0 is "off by a factor of two".
  function typicalMiss(res) { return Math.exp(median(res.map(Math.abs))); }
  function brier(p, y) { var s = 0; for (var i = 0; i < p.length; i++) s += (p[i] - y[i]) * (p[i] - y[i]); return s / p.length; }
  // A deterministic fold from a slug (FNV-1a): folds never depend on order or a seed.
  function foldOf(slug, k) {
    var h = 0x811c9dc5;
    for (var i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h % k;
  }
  function round(n, d) { var f = Math.pow(10, d === undefined ? 4 : d); return Math.round(n * f) / f; }

  var api = { solve: solve, ridge: ridge, logistic: logistic, dot: dot, sigmoid: sigmoid, median: median, quantile: quantile, typicalMiss: typicalMiss, brier: brier, foldOf: foldOf, round: round };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarStats = api;
})(this);
