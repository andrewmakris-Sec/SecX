// Check 3: content integrity. Loads the app in a jsdom-backed sandbox (real
// DOM so the app's own init code doesn't need stubbing) and asserts every
// invariant from the brief against the live data structures and grading
// functions, plus a full grading truth table per question type.
const { loadApp } = require('../dom.js');

const failures = [];
function assert(cond, msg) { if (!cond) failures.push(msg); }

(async () => {
  const { exp, errors } = await loadApp();
  assert(errors.length === 0, `unexpected script errors during load: ${errors.map(e => e.message).join('; ')}`);
  const { data, fns } = exp;
  const { FLAT, QUESTIONS, DOMAINS } = data;
  const { isAnswered, isCorrect, defectIdx, multiNeed, NEEDWORD } = fns;

  // --- Invariant 1: marker <-> note 1:1 ---
  for (const l of FLAT) {
    const markers = (l.art.lines || []).filter(ln => ln.m != null).map(ln => ln.m);
    const notesLen = (l.notes || []).length;
    const uniq = new Set(markers);
    if (uniq.size !== markers.length) failures.push(`lesson ${l.id}: duplicate markers ${markers}`);
    if (markers.length !== notesLen) failures.push(`lesson ${l.id}: ${markers.length} markers but ${notesLen} notes`);
    const sorted = [...uniq].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) failures.push(`lesson ${l.id}: markers not a contiguous 1..N sequence (got ${sorted})`);
    }
  }

  // --- Invariant 2: every lesson has a check with >=3 unique options and a valid answer index ---
  for (const l of FLAT) {
    if (!l.check) { failures.push(`lesson ${l.id}: missing check`); continue; }
    const opts = l.check.opts || [];
    if (opts.length < 3) failures.push(`lesson ${l.id}: check has only ${opts.length} options`);
    if (new Set(opts).size !== opts.length) failures.push(`lesson ${l.id}: check options not unique`);
    if (!(Number.isInteger(l.check.a) && l.check.a >= 0 && l.check.a < opts.length)) {
      failures.push(`lesson ${l.id}: check.a=${l.check.a} out of range for ${opts.length} options`);
    }
  }

  // --- Invariant 3: highlight tags balanced per artifact line ---
  const TAGS = ['k', 's', 'n', 'x', 'q'];
  function tagBalance(text, where) {
    for (const t of TAGS) {
      const opens = (text.match(new RegExp(`<${t}>`, 'g')) || []).length;
      const closes = (text.match(new RegExp(`</${t}>`, 'g')) || []).length;
      if (opens !== closes) failures.push(`${where}: unbalanced <${t}> (${opens} open, ${closes} close)`);
    }
  }
  for (const l of FLAT) {
    for (const ln of l.art.lines || []) tagBalance(ln.c || '', `lesson ${l.id} artifact line`);
  }

  // --- Invariant 4: question IDs globally unique ---
  const qIds = QUESTIONS.map(q => q.id);
  const qIdSet = new Set(qIds);
  if (qIdSet.size !== qIds.length) {
    const seen = new Set(), dupes = new Set();
    for (const id of qIds) { if (seen.has(id)) dupes.add(id); seen.add(id); }
    failures.push(`duplicate question IDs: ${[...dupes].join(', ')}`);
  }

  // --- Invariant 5: multi prompts state the matching count word ---
  for (const q of QUESTIONS) {
    if (q.type !== 'multi') continue;
    const need = multiNeed(q);
    const word = NEEDWORD[need];
    if (!word) { failures.push(`question ${q.id}: multi with unsupported count ${need}`); continue; }
    if (!q.q.toUpperCase().includes(word)) {
      failures.push(`question ${q.id}: multi prompt missing count word "${word}" for a.length=${need}: "${q.q}"`);
    }
  }

  // --- Invariant 6: defect questions are never shuffled (ex.sh stays null) ---
  {
    const ex = exp.exState();
    ex.size = QUESTIONS.length; ex.real = false; ex.timed = false;
    fns.eStart();
    ex.qs.forEach((q, i) => {
      if (q.type === 'defect' && ex.sh[i] !== null) {
        failures.push(`defect question ${q.id} has a non-null shuffle array — it must never be shuffled`);
      }
    });
  }

  // --- Invariant 7: content is inert (no executable payloads left un-escaped) ---
  const DANGEROUS = /<script[\s>]|<[a-z][^>]*\son\w+\s*=/i;
  function scanStrings(obj, where) {
    if (obj == null) return;
    if (typeof obj === 'string') {
      if (DANGEROUS.test(obj)) failures.push(`${where}: contains un-escaped executable-looking markup: ${obj.slice(0, 80)}`);
      return;
    }
    if (Array.isArray(obj)) { obj.forEach((v, i) => scanStrings(v, `${where}[${i}]`)); return; }
    if (typeof obj === 'object') { for (const k of Object.keys(obj)) scanStrings(obj[k], `${where}.${k}`); }
  }
  scanStrings(FLAT, 'lesson');
  scanStrings(QUESTIONS, 'question');
  scanStrings(data.FLASHCARDS, 'flashcard');

  // --- Invariant 8: storage backend resolves in this (jsdom) environment ---
  const state = exp.state();
  assert(state.BACKEND === 'local', `expected BACKEND to resolve to 'local' under jsdom, got ${state.BACKEND}`);

  // --- Invariant 9: load-bearing CSS classes are referenced from JS ---
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'securityx-readiness.html'), 'utf8');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  const SAMPLE_LOAD_BEARING = ['opt', 'qbox', 'al', 'nt', 'tab', 'panel', 'mgrid', 'oslot', 'oitem', 'art', 'art-b', 'chip', 'exp', 'hint'];
  for (const c of SAMPLE_LOAD_BEARING) {
    if (!cssClasses.has(c)) failures.push(`load-bearing class .${c} not found in <style> block`);
  }
  assert(cssClasses.size >= 100, `expected >=100 CSS classes (load-bearing surface), found ${cssClasses.size}`);

  // --- Invariant 10: no AI/network calls at runtime beyond fonts + Pluralsight links ---
  // Scoped to the application-logic section (from the storage keys onward) —
  // the data literals above it legitimately contain escaped strings like
  // "&lt;img onerror=\"fetch(...)\"&gt;" as XSS teaching content, not live code.
  const js = html.split('<script>')[1].split('</script>')[0];
  const logicJs = js.slice(js.indexOf('const K={fc:'));
  for (const pat of [/\bfetch\s*\(/, /new\s+XMLHttpRequest/, /new\s+WebSocket/, /\bimport\s*\(/]) {
    if (pat.test(logicJs)) failures.push(`runtime network call found matching ${pat}`);
  }
  const links = [...html.matchAll(/<link[^>]*href="([^"]+)"/g)].map(m => m[1]);
  for (const href of links) {
    // data: URIs (e.g. an inline SVG favicon) never touch the network.
    if (href.startsWith('data:')) continue;
    if (!/fonts\.(googleapis|gstatic)\.com/.test(href)) failures.push(`unexpected <link> to non-fonts host: ${href}`);
  }

  // --- Grading truth table (synthetic, one per type) ---
  const mcqQ = { type: 'mcq', a: 1 };
  assert(!isAnswered(mcqQ, null), 'mcq: null should not be answered');
  assert(isAnswered(mcqQ, 1) && isCorrect(mcqQ, 1), 'mcq: correct index should grade correct');
  assert(isAnswered(mcqQ, 0) && !isCorrect(mcqQ, 0), 'mcq: wrong index should grade incorrect');

  const multiQ = { type: 'multi', a: [0, 2] };
  assert(!isAnswered(multiQ, []), 'multi: empty selection should not be answered');
  assert(isCorrect(multiQ, [0, 2]) && isCorrect(multiQ, [2, 0]), 'multi: exact set (any order) should grade correct');
  assert(!isCorrect(multiQ, [0]), 'multi: partial selection should grade incorrect');
  assert(!isCorrect(multiQ, [0, 1, 2]), 'multi: extra selection should grade incorrect');
  assert(!isCorrect(multiQ, [1, 3]), 'multi: inverted/wrong selection should grade incorrect');

  const orderQ = { type: 'order', items: ['a', 'b', 'c'] };
  assert(!isAnswered(orderQ, []), 'order: empty should not be answered');
  assert(!isAnswered(orderQ, [0, 1]), 'order: partial sequence should not be answered');
  assert(isCorrect(orderQ, [0, 1, 2]), 'order: identity sequence should grade correct');
  assert(!isCorrect(orderQ, [1, 0, 2]), 'order: swapped adjacent items should grade incorrect');

  const matchQ = { type: 'match', pairs: [['a', '1'], ['b', '2'], ['c', '3']] };
  assert(!isAnswered(matchQ, {}), 'match: empty should not be answered');
  assert(!isAnswered(matchQ, { 0: 0 }), 'match: partial pairing should not be answered');
  assert(isCorrect(matchQ, { 0: 0, 1: 1, 2: 2 }), 'match: identity pairing should grade correct');
  assert(!isCorrect(matchQ, { 0: 1, 1: 0, 2: 2 }), 'match: swapped pairing should grade incorrect');

  const defectQ = { type: 'defect', lines: [{ c: 'ok' }, { c: 'bad', bad: true }, { c: 'bad2', bad: true }] };
  assert(!isAnswered(defectQ, []), 'defect: empty should not be answered');
  assert(isCorrect(defectQ, [1, 2]), 'defect: exact defect set should grade correct');
  assert(!isCorrect(defectQ, [1]), 'defect: missing a defect should grade incorrect');
  assert(!isCorrect(defectQ, [0, 1, 2]), 'defect: extra (non-defect) line should grade incorrect');

  if (failures.length) {
    console.error(`FAIL: content integrity — ${failures.length} violation(s):`);
    failures.forEach(f => console.error(' -', f));
    process.exit(1);
  }
  console.log(`PASS: content integrity — ${FLAT.length} lessons, ${QUESTIONS.length} questions, all invariants + grading truth table hold`);
})().catch(err => { console.error('FAIL: content integrity threw:', err); process.exit(1); });
