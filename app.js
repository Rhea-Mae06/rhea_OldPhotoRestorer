(() => {
'use strict';
const $ = s => document.querySelector(s);
const PREVIEW_MAX = 1400, EXPORT_MAX = 3600;

const DEFAULTS = {levels:0, cast:0, shadows:0, brightness:0, contrast:0, saturation:0, warmth:0, dust:0, denoise:0, sharpen:0, tone:'color'};
const CONTROLS = [
  ['Restore', [
    ['levels','Fix faded tones',0,100,'Stretches washed-out shadows and highlights'],
    ['cast','Remove colour cast',0,100,'Neutralises yellow, green or red tints']]],
  ['Light', [
    ['brightness','Brightness',-100,100],
    ['shadows','Lift dark areas',-100,100,'Opens up shadows without blowing out highlights'],
    ['contrast','Contrast',-100,100]]],
  ['Colour', [
    ['saturation','Colour richness',-100,100],
    ['warmth','Warmth',-100,100]]],
  ['Clean up', [
    ['dust','Dust and scratches',0,100,'Removes thin scratches and small specks'],
    ['denoise','Grain and noise',0,100],
    ['sharpen','Sharpness',0,100]]]
];
const PRESETS = {
  'Auto restore': {levels:85,cast:70,contrast:10,saturation:10,dust:35,denoise:20,sharpen:25},
  'Brighten dark photo': {levels:60,cast:50,shadows:55,brightness:15,contrast:10,denoise:35,sharpen:20},
  'Revive faded colours': {levels:100,cast:90,contrast:20,saturation:30,sharpen:25},
  'Clean scratches': {levels:40,cast:30,dust:75,denoise:30,sharpen:15}
};

const state = {img:null, name:'photo', src:null, stats:null, p:{...DEFAULTS}};
const el = {frame:$('#frame'), before:$('#before'), after:$('#after'), drop:$('#drop'), hint:$('#hint'), handle:$('#handle')};
const inputs = {};

/* ---------- UI build ---------- */
const sl = $('#sliders');
CONTROLS.forEach(([title, items]) => {
  const box = document.createElement('div'); box.className = 'sl';
  box.innerHTML = `<h3>${title}</h3>`;
  items.forEach(([key, label, min, max, tip]) => {
    const row = document.createElement('div'); row.className = 'sl';
    row.innerHTML = `<label for="s-${key}">${label}<output id="o-${key}">0</output></label>
      <input type="range" id="s-${key}" min="${min}" max="${max}" value="0">${tip ? `<small>${tip}</small>` : ''}`;
    box.appendChild(row);
    const inp = row.querySelector('input'); inputs[key] = inp;
    inp.addEventListener('input', () => { state.p[key] = +inp.value; sync(); schedule(); });
  });
  sl.appendChild(box);
});
const chips = $('#chips');
Object.keys(PRESETS).forEach(name => {
  const b = document.createElement('button'); b.textContent = name;
  b.onclick = () => { if (!state.img) return toast('Add a photo first.'); applyParams({...DEFAULTS, ...PRESETS[name]}); };
  chips.appendChild(b);
});
document.querySelectorAll('#tone button').forEach(b => b.onclick = () => { state.p.tone = b.dataset.t; sync(); schedule(); });
const toolPresets = ['Auto restore', 'Revive faded colours', 'Brighten dark photo', 'Clean scratches', 'Clean scratches', 'Clean scratches', 'Brighten dark photo', 'Clean scratches', 'Auto restore'];
document.querySelectorAll('.tool').forEach((b, i) => b.addEventListener('click', () => {
  document.querySelectorAll('.tool').forEach(x => x.classList.remove('active')); b.classList.add('active');
  if (!state.img) return toast('Add a photo first.');
  if (i === 1) applyParams({...DEFAULTS, ...PRESETS['Revive faded colours'], tone:'bw'});
  else applyParams({...DEFAULTS, ...PRESETS[toolPresets[i]]});
}));
const sessionFilters = {
  original: {...DEFAULTS},
  processing: {...DEFAULTS, ...PRESETS['Auto restore']},
  restored: {...DEFAULTS, ...PRESETS['Auto restore']},
  bright: {...DEFAULTS, ...PRESETS['Brighten dark photo']},
  colour: {...DEFAULTS, ...PRESETS['Revive faded colours']},
  clean: {...DEFAULTS, ...PRESETS['Clean scratches']},
  bw: {...DEFAULTS, ...PRESETS['Brighten dark photo'], tone:'bw'}
};
document.querySelectorAll('[data-filter]').forEach(card => card.addEventListener('click', () => {
  document.querySelectorAll('[data-filter]').forEach(x => x.classList.remove('selected'));
  card.classList.add('selected');
  if (!state.img) return loadURL(makeSample(), 'sample', () => {
    applyParams(sessionFilters[card.dataset.filter]);
    document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('selected', x === card));
  });
  applyParams(sessionFilters[card.dataset.filter]);
}));

function sync() {
  for (const k in inputs) { inputs[k].value = state.p[k]; $('#o-' + k).textContent = state.p[k]; }
  document.querySelectorAll('#tone button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === state.p.tone));
}
function applyParams(p) { state.p = {...p}; sync(); schedule(); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }

/* ---------- Loading ---------- */
function setButtons(on) { ['#save','#reset'].forEach(s => $(s).disabled = !on); }

function loadURL(url, name, done) {
  const img = new Image();
  img.onload = () => {
    state.img = img; state.name = name;
    const s = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    [el.before, el.after].forEach(c => { c.width = w; c.height = h; });
    const ctx = el.before.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(img, 0, 0, w, h);
    state.src = ctx.getImageData(0, 0, w, h);
    state.stats = analyze(state.src);
    el.frame.style.aspectRatio = `${w} / ${h}`;
    el.frame.style.width = `min(100%, calc(66vh * ${w / h}))`;
    el.drop.hidden = true; el.frame.hidden = false; el.hint.hidden = false;
    setPos(50); setButtons(true);
    applyParams({...DEFAULTS, ...PRESETS['Auto restore']});
    document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('selected', x.dataset.filter === 'restored'));
    if (done) done();
    toast('Photo loaded. Auto restore applied.');
  };
  img.onerror = () => toast('That file could not be read as an image. Try a JPG, PNG or WebP.');
  img.src = url;
}
function loadFile(f) {
  if (!f) return;
  if (!f.type.startsWith('image/')) return toast('Please choose an image file (JPG, PNG or WebP).');
  loadURL(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/, ''));
}
$('#file').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
['dragenter','dragover'].forEach(ev => el.drop.addEventListener(ev, e => { e.preventDefault(); el.drop.classList.add('over'); }));
['dragleave','drop'].forEach(ev => el.drop.addEventListener(ev, e => { e.preventDefault(); el.drop.classList.remove('over'); }));
el.drop.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); if (!el.drop.contains(e.target)) loadFile(e.dataTransfer.files[0]); });
$('#sample').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); loadURL(makeSample(), 'sample'); });
$('#reset').onclick = () => applyParams({...DEFAULTS});
$('#again').onclick = $('#upload').onclick = () => $('#file').click();

/* ---------- Compare slider ---------- */
let pos = 50;
function setPos(v) {
  pos = Math.min(100, Math.max(0, v));
  el.before.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
  el.handle.style.left = pos + '%';
  el.handle.setAttribute('aria-valuenow', Math.round(pos));
}
let dragging = false;
const move = e => { const r = el.frame.getBoundingClientRect(); setPos((e.clientX - r.left) / r.width * 100); };
el.frame.addEventListener('pointerdown', e => { dragging = true; el.frame.setPointerCapture(e.pointerId); move(e); });
el.frame.addEventListener('pointermove', e => dragging && move(e));
el.frame.addEventListener('pointerup', () => dragging = false);
el.frame.addEventListener('pointercancel', () => dragging = false);
el.handle.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { setPos(pos - 3); e.preventDefault(); }
  if (e.key === 'ArrowRight') { setPos(pos + 3); e.preventDefault(); }
  if (e.key === 'Home') setPos(0); if (e.key === 'End') setPos(100);
});

/* ---------- Rendering ---------- */
let queued = false;
function schedule() {
  if (!state.src || queued) return; queued = true;
  requestAnimationFrame(() => { queued = false; el.after.getContext('2d').putImageData(process(state.src, state.p, state.stats), 0, 0); });
}
$('#save').onclick = () => {
  const img = state.img, s = Math.min(1, EXPORT_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(img, 0, 0, c.width, c.height);
  x.putImageData(process(x.getImageData(0, 0, c.width, c.height), state.p, state.stats), 0, 0);
  c.toBlob(b => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${state.name}-restored.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Saved your restored photo.');
  }, 'image/png');
};

/* ---------- Image processing ---------- */
// Finds the darkest and brightest real tones (ignoring 0.5% outliers) per channel and for brightness overall.
function analyze(im) {
  const d = im.data, n = d.length / 4, H = [0,1,2,3].map(() => new Uint32Array(256));
  for (let i = 0; i < d.length; i += 4) {
    H[0][d[i]]++; H[1][d[i+1]]++; H[2][d[i+2]]++;
    H[3][(.299 * d[i] + .587 * d[i+1] + .114 * d[i+2]) | 0]++;
  }
  const clip = n * 0.005, lo = [], hi = [];
  H.forEach(h => {
    let a = 0, l = 0, r = 255; while (l < 254 && (a += h[l]) < clip) l++;
    a = 0; while (r > l + 20 && (a += h[r]) < clip) r--;
    lo.push(l); hi.push(Math.max(r, l + 20));
  });
  return {lo:lo.slice(0, 3), hi:hi.slice(0, 3), loL:lo[3], hiL:hi[3]};
}

function process(src, p, st) {
  const w = src.width, h = src.height;
  let d = new Uint8ClampedArray(src.data);
  if (p.dust > 0) despeckle(d, w, h, p.dust);
  if (p.denoise > 0) d = smooth(d, w, h, p.denoise / 100);
  colour(d, p, st);
  if (p.sharpen > 0) d = sharpen(d, w, h, p.sharpen / 100 * 1.6);
  return new ImageData(d, w, h);
}

function colour(d, p, st) {
  const s = p.levels / 100, c = p.cast / 100;
  const gam = Math.pow(2, p.shadows / 35), con = 1 + p.contrast / 100, br = p.brightness / 100 * .35;
  const luts = [0,1,2].map(ch => {
    const lo0 = st.loL + (st.lo[ch] - st.loL) * c, hi0 = st.hiL + (st.hi[ch] - st.hiL) * c;
    const lo = lo0 * s, hi = 255 + (hi0 - 255) * s, t = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let x = Math.min(1, Math.max(0, (i - lo) / (hi - lo)));
      x = Math.pow(x, 1 / gam) + br;
      t[i] = ((x - .5) * con + .5) * 255;
    }
    return t;
  });
  const [R, G, B] = luts, sat = 1 + p.saturation / 100, wm = p.warmth / 100 * .25, tone = p.tone;
  for (let i = 0; i < d.length; i += 4) {
    let r = R[d[i]], g = G[d[i+1]], b = B[d[i+2]];
    const y = .299 * r + .587 * g + .114 * b;
    if (tone === 'bw') { r = g = b = y; }
    else if (tone === 'sepia') { r = y * 1.07 + 12; g = y * .97 + 4; b = y * .78; }
    else { r = (y + (r - y) * sat) * (1 + wm); g = y + (g - y) * sat; b = (y + (b - y) * sat) * (1 - wm); }
    d[i] = r; d[i+1] = g; d[i+2] = b;
  }
}

// 3x3 box blur (edges clamped)
function blur3(d, w, h) {
  const o = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1), i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        let t = 0;
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) t += d[(yy * w + xx) * 4 + k];
        o[i + k] = t / ((y1 - y0 + 1) * (x1 - x0 + 1));
      }
      o[i + 3] = 255;
    }
  }
  return o;
}
// Edge-aware noise smoothing: flat areas are blended with their blur, edges are kept
function smooth(d, w, h, a) {
  const b = blur3(d, w, h);
  for (let i = 0; i < d.length; i += 4) {
    const diff = Math.abs(.299 * (d[i] - b[i]) + .587 * (d[i+1] - b[i+1]) + .114 * (d[i+2] - b[i+2]));
    const k = a * Math.max(0, 1 - diff / 40);
    d[i] += (b[i] - d[i]) * k; d[i+1] += (b[i+1] - d[i+1]) * k; d[i+2] += (b[i+2] - d[i+2]) * k;
  }
  return d;
}
// Unsharp mask
function sharpen(d, w, h, k) {
  const b = blur3(d, w, h), o = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    o[i] = d[i] + (d[i] - b[i]) * k; o[i+1] = d[i+1] + (d[i+1] - b[i+1]) * k; o[i+2] = d[i+2] + (d[i+2] - b[i+2]) * k; o[i+3] = 255;
  }
  return o;
}
// Median-based dust and scratch removal: a pixel that is much brighter or darker than the
// median of its 3x3 neighbourhood is replaced by the neighbour closest to that median.
function despeckle(d, w, h, amount) {
  const src = new Uint8ClampedArray(d), L = new Float32Array(w * h), thr = 70 - amount * .55;
  for (let i = 0; i < L.length; i++) L[i] = .299 * src[i*4] + .587 * src[i*4+1] + .114 * src[i*4+2];
  const v = new Float32Array(9), idx = new Int32Array(9);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const c = y * w + x; let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { idx[n] = c + dy * w + dx; v[n++] = L[idx[n - 1]]; }
    const s = Array.from(v).sort((a, b) => a - b), med = s[4];
    if (Math.abs(L[c] - med) > thr) {
      let best = idx[0], bd = 1e9;
      for (let j = 0; j < 9; j++) if (idx[j] !== c) { const q = Math.abs(L[idx[j]] - med); if (q < bd) { bd = q; best = idx[j]; } }
      d[c*4] = src[best*4]; d[c*4+1] = src[best*4+1]; d[c*4+2] = src[best*4+2];
    }
  }
}

/* ---------- Built-in sample: a faded, dark, scratched "old print" ---------- */
function makeSample() {
  const W = 900, H = 620, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', {willReadFrequently:true});
  let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#4f8fd6'); g.addColorStop(.6, '#f4d9a0'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff3c4'; x.beginPath(); x.arc(690, 190, 58, 0, 7); x.fill();
  x.fillStyle = '#3f7d4a'; x.beginPath(); x.moveTo(0, 410); x.quadraticCurveTo(250, 290, 520, 400); x.quadraticCurveTo(730, 470, W, 370); x.lineTo(W, H); x.lineTo(0, H); x.fill();
  x.fillStyle = '#2b5e38'; x.beginPath(); x.moveTo(0, 500); x.quadraticCurveTo(450, 440, W, 510); x.lineTo(W, H); x.lineTo(0, H); x.fill();
  x.fillStyle = '#d0735a'; x.fillRect(250, 360, 220, 140);
  x.fillStyle = '#6b3a2e'; x.beginPath(); x.moveTo(230, 365); x.lineTo(360, 270); x.lineTo(490, 365); x.fill();
  x.fillStyle = '#f2e4c0'; x.fillRect(290, 400, 50, 50); x.fillRect(390, 400, 50, 50);
  x.fillStyle = '#5a3326'; x.fillRect(345, 430, 40, 70);
  [[560,470,'#8b3d3d'],[620,475,'#2f4f7a']].forEach(([px, py, col]) => {
    x.fillStyle = '#e8c4a0'; x.beginPath(); x.arc(px, py - 70, 20, 0, 7); x.fill();
    x.fillStyle = col; x.fillRect(px - 22, py - 50, 44, 90);
  });
  const im = x.getImageData(0, 0, W, H), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - .5) * 26;
    d[i] = (128 + (d[i] - 128) * .42) * .62 + 14 + n;
    d[i+1] = (128 + (d[i+1] - 128) * .42) * .56 + 10 + n;
    d[i+2] = (128 + (d[i+2] - 128) * .42) * .42 + 4 + n;
  }
  x.putImageData(im, 0, 0);
  for (let i = 0; i < 9; i++) {
    x.strokeStyle = `rgba(${Math.random() < .5 ? '225,215,190' : '30,20,10'},.65)`; x.lineWidth = 1;
    const sx = Math.random() * W; x.beginPath(); x.moveTo(sx, Math.random() * 120); x.lineTo(sx + (Math.random() - .5) * 20, H - Math.random() * 120); x.stroke();
  }
  for (let i = 0; i < 160; i++) { x.fillStyle = Math.random() < .6 ? 'rgba(235,225,200,.8)' : 'rgba(25,15,5,.7)'; x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
  return c.toDataURL('image/png');
}

sync();
})();
