// Check 5: reload persistence. Make progress in one jsdom instance, capture
// its localStorage, tear it down, and confirm a completely fresh jsdom
// instance seeded with that snapshot restores identical progress. This is
// the check that would catch the storage adapter's write-through MEM cache
// or the K key names drifting apart from what a save actually wrote.
const { loadApp } = require('../dom.js');

const failures = [];
function assert(cond, msg) { if (!cond) failures.push(msg); }
const tick = (window, ms = 0) => new Promise(r => window.setTimeout(r, ms));

(async () => {
  // --- Session 1: make progress ---
  const a = await loadApp();
  assert(a.errors.length === 0, `session 1: unexpected script errors: ${a.errors.map(e => e.message).join('; ')}`);

  // Study + complete the first lesson via its inline check.
  const lessonHost = a.document.getElementById('lesson');
  const L = a.exp.fns.curLesson();
  assert(L && L.check, 'session 1: current lesson has no check to answer');
  const correctBtn = [...lessonHost.querySelectorAll('.qbox .opt')][L.check.a];
  assert(correctBtn, 'session 1: could not find the correct check option to click');
  correctBtn.click();
  await tick(a.window);

  // Flip and grade a flashcard.
  a.document.querySelector('.tab[data-t="flash"]').click();
  const fcId = a.document.getElementById('fcDeck') && a.exp.data.FLASHCARDS[0].id;
  a.document.getElementById('fc').click();
  a.document.getElementById('bYes').click();
  await tick(a.window);

  // Run a tiny practice exam and submit it so examHistory is non-empty.
  a.document.querySelector('.tab[data-t="exam"]').click();
  a.document.getElementById('eSize').value = '15';
  a.document.getElementById('eTimed').value = '0';
  a.document.getElementById('eStart').click();
  await tick(a.window);
  const qs = a.exp.exState().qs;
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (q.type === 'mcq') {
      a.document.getElementById('eQ').querySelector('.opt').click();
    } else if (q.type === 'multi') {
      for (let k = 0; k < q.a.length; k++) a.document.getElementById('eQ').querySelectorAll('.opt')[k].click();
    } else if (q.type === 'order' || q.type === 'build') {
      for (let k = 0; k < q.items.length; k++) {
        const pool = a.document.getElementById('eQ').querySelector('.oitem');
        if (pool) pool.click();
      }
    } else if (q.type === 'match') {
      for (let k = 0; k < q.pairs.length; k++) {
        const l = a.document.getElementById('eQ').querySelector('.mcol .mi:not(.bd)');
        if (l) l.click();
        const rc = a.document.getElementById('eQ').querySelectorAll('.mcol')[1];
        const r = rc && rc.querySelector('.mi:not(.tk)');
        if (r) r.click();
      }
    } else if (q.type === 'defect') {
      const idxs = q.lines.map((l, ix) => l.bad ? ix : -1).filter(ix => ix >= 0);
      for (const ix of idxs) {
        const rows = a.document.getElementById('eQ').querySelectorAll('.al');
        if (rows[ix]) rows[ix].click();
      }
    }
    const nextBtn = a.document.getElementById('eNext');
    if (nextBtn && !nextBtn.disabled) nextBtn.click();
  }
  a.document.getElementById('eSub').click();
  await tick(a.window);

  const stateBefore = a.exp.state();
  assert(Object.keys(stateBefore.lessonDone).length > 0, 'session 1: no lesson was marked done');
  assert(Object.keys(stateBefore.fcState).length > 0, 'session 1: no flashcard state recorded');
  assert(stateBefore.examHistory.length === 1, `session 1: expected 1 exam attempt recorded, got ${stateBefore.examHistory.length}`);

  // Snapshot every secx:* key exactly as sSet actually wrote it.
  const snapshot = {};
  for (let i = 0; i < a.window.localStorage.length; i++) {
    const k = a.window.localStorage.key(i);
    if (k.startsWith('secx:')) snapshot[k] = a.window.localStorage.getItem(k);
  }
  assert(Object.keys(snapshot).length > 0, 'session 1: no secx:* keys were written to localStorage');
  a.window.close();

  // --- Session 2: fresh JSDOM, seeded with session 1's exact storage ---
  const b = await loadApp({ storage: snapshot });
  assert(b.errors.length === 0, `session 2: unexpected script errors: ${b.errors.map(e => e.message).join('; ')}`);
  const stateAfter = b.exp.state();

  assert(JSON.stringify(stateAfter.lessonDone) === JSON.stringify(stateBefore.lessonDone),
    `lessonDone did not restore identically: before=${JSON.stringify(stateBefore.lessonDone)} after=${JSON.stringify(stateAfter.lessonDone)}`);
  assert(JSON.stringify(stateAfter.fcState) === JSON.stringify(stateBefore.fcState),
    `fcState did not restore identically: before=${JSON.stringify(stateBefore.fcState)} after=${JSON.stringify(stateAfter.fcState)}`);
  assert(JSON.stringify(stateAfter.examHistory) === JSON.stringify(stateBefore.examHistory),
    `examHistory did not restore identically`);
  assert(stateAfter.BACKEND === 'local', `expected restored session to also use 'local' backend, got ${stateAfter.BACKEND}`);

  // The restored lesson-done flag should also be reflected live in the rendered rail (courseRatio > 0).
  assert(b.exp.fns.courseRatio() > 0, 'restored session renders 0% course progress despite a completed lesson');

  b.window.close();

  if (failures.length) {
    console.error(`FAIL: reload persistence — ${failures.length} violation(s):`);
    failures.forEach(f => console.error(' -', f));
    process.exit(1);
  }
  console.log('PASS: reload persistence — lesson/flashcard/exam progress survives a full teardown + fresh-jsdom reload');
})().catch(err => { console.error('FAIL: reload persistence threw:', err); process.exit(1); });
