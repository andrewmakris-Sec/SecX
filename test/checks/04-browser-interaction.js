// Check 4: real DOM interaction via jsdom. Click every tab, flip a card,
// answer one question of each type through the production renderQ/rXxx
// functions, run and submit a practice exam, verify note-hover highlighting
// and domain-accent recoloring. Assert 0 runtime errors throughout.
const { loadApp } = require('../dom.js');

const failures = [];
function assert(cond, msg) { if (!cond) failures.push(msg); }
const tick = (window, ms = 0) => new Promise(r => window.setTimeout(r, ms));

async function run(seed) {
  const { window, document, exp, errors } = await loadApp();
  const { data, fns } = exp;

  // --- click through every tab ---
  const tabIds = ['home', 'course', 'flash', 'notes', 'drill', 'exam', 'cram', 'search', 'track', 'plan'];
  for (const t of tabIds) {
    const btn = document.querySelector(`.tab[data-t="${t}"]`);
    assert(btn, `tab button for "${t}" not found`);
    btn.click();
    const panel = document.getElementById('p-' + t);
    assert(panel && panel.classList.contains('on'), `panel p-${t} did not activate on click`);
  }

  // --- domain overview: clicking a rail domain header shows an overview,
  // and clicking one of its module cards drops into that module's first lesson ---
  document.querySelector('.tab[data-t="course"]').click();
  const domainHeader = document.querySelector('.rd-h');
  assert(domainHeader, 'no domain header found in the course rail');
  domainHeader.click();
  const moduleCards = document.querySelectorAll('#lesson .nav-card');
  assert(moduleCards.length > 0, 'domain overview rendered no module cards');
  moduleCards[0].click();
  const lessonTitle = document.querySelector('#lesson h2');
  assert(lessonTitle && lessonTitle.textContent.length > 0, 'clicking a module card did not open a lesson');
  assert(!document.querySelector('#lesson .nav-grid'), 'still showing the domain overview after clicking into a module');

  // --- home nav-card click routes to the right tab ---
  document.querySelector('.tab[data-t="home"]').click();
  const flashCard = document.querySelector('#hmGrid .nav-card[data-go="flash"]');
  assert(flashCard, 'home grid has no nav-card for the flash tab');
  flashCard.click();
  assert(document.getElementById('p-flash').classList.contains('on'), 'clicking the Cards nav-card on Home did not switch to the Cards tab');

  // --- domain accent recoloring ---
  document.querySelector('.tab[data-t="flash"]').click();
  const accentOnFlash = document.documentElement.style.getPropertyValue('--ac');
  document.querySelector('.tab[data-t="course"]').click();
  const accentOnCourse = document.documentElement.style.getPropertyValue('--ac');
  assert(accentOnFlash === data.DEFAULT_AC.hex, `expected default accent on non-course tab, got ${accentOnFlash}`);
  assert(accentOnCourse && accentOnCourse !== accentOnFlash, 'domain accent did not recolor when switching to the course tab');

  // --- note-hover highlighting ---
  const lessonHost = document.getElementById('lesson');
  const firstNote = lessonHost.querySelector('.nt');
  if (firstNote) {
    firstNote.dispatchEvent(new window.Event('mouseenter'));
    const hi = lessonHost.querySelectorAll('.al.hi');
    assert(hi.length > 0, 'hovering the first note did not highlight any artifact line');
    firstNote.dispatchEvent(new window.Event('mouseleave'));
    assert(lessonHost.querySelectorAll('.al.hi').length === 0, 'mouseleave did not clear artifact highlight');
  } else {
    failures.push('current lesson has no notes to test hover-highlighting with');
  }

  // --- flip a flashcard and grade it ---
  document.querySelector('.tab[data-t="flash"]').click();
  const fc = document.getElementById('fc');
  const before = fc.classList.contains('flip');
  fc.click();
  assert(fc.classList.contains('flip') !== before, 'clicking the flashcard did not toggle the flip state');
  const yesBtn = document.getElementById('bYes');
  assert(yesBtn, '#bYes grade button not found');
  yesBtn.click();
  await tick(window);

  // --- answer one question of each type through the real renderers ---
  const { renderQ, isAnswered, isCorrect } = fns;
  const byType = {};
  for (const q of data.QUESTIONS) if (!byType[q.type]) byType[q.type] = q;
  assert(Object.keys(byType).length === 6, `expected all 6 question types present, found ${Object.keys(byType)}`);

  for (const [type, q] of Object.entries(byType)) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let ans = type === 'match' ? {} : (type === 'multi' || type === 'order' || type === 'build' || type === 'defect' ? [] : null);
    let matchSel = null;
    const st = {
      get ans() { return ans; },
      get matchSel() { return matchSel; },
      locked: false, reveal: false,
      shuf: q.type === 'defect' ? null : [...Array(q.type === 'match' ? q.pairs.length : (q.type === 'order' || q.type === 'build') ? q.items.length : q.opts.length).keys()],
      onAnswer: (a, s) => { ans = a; if (s !== undefined) matchSel = s; renderQ(host, q, st); },
    };
    renderQ(host, q, st);

    if (type === 'mcq') {
      host.querySelectorAll('.opt')[q.a].click();
    } else if (type === 'multi') {
      for (const idx of q.a) host.querySelectorAll('.opt')[idx].click();
    } else if (type === 'order' || type === 'build') {
      for (let i = 0; i < q.items.length; i++) host.querySelector('.oitem').click();
    } else if (type === 'match') {
      for (let i = 0; i < q.pairs.length; i++) {
        host.querySelector('.mcol .mi:not(.bd)').click();
        const rightCol = host.querySelectorAll('.mcol')[1];
        rightCol.querySelector('.mi:not(.tk)').click();
      }
    } else if (type === 'defect') {
      const idx = q.lines.map((l, i) => l.bad ? i : -1).filter(i => i >= 0);
      for (const i of idx) host.querySelectorAll('.al')[i].click();
    }

    assert(isAnswered(q, ans), `[${type}] question ${q.id} not marked answered after simulated interaction (ans=${JSON.stringify(ans)})`);
    assert(isCorrect(q, ans), `[${type}] question ${q.id} not graded correct after answering with the known-correct interaction`);
    host.remove();
  }

  // --- run and submit a practice exam ---
  document.querySelector('.tab[data-t="exam"]').click();
  document.getElementById('eSize').value = '15';
  document.getElementById('eTimed').value = '0';
  document.getElementById('eStart').click();
  await tick(window);

  const historyBefore = exp.state ? undefined : undefined; // placeholder, real read below
  const beforeCount = fns.eStart ? undefined : undefined;
  const examLenBefore = (exp.exState().qs || []).length;
  assert(examLenBefore === 15, `expected a 15-question practice exam, got ${examLenBefore}`);

  // Every onAnswer callback triggers a full ePaint(), which replaces the
  // entire #eQ subtree (not just its contents) — so #eQ must be re-fetched
  // fresh before *every single click*, not once per question, or later
  // clicks land on a detached, stale copy of the pre-answer render.
  for (let i = 0; i < examLenBefore; i++) {
    const q = exp.exState().qs[i];
    if (q.type === 'mcq') {
      document.getElementById('eQ').querySelector('.opt').click();
    } else if (q.type === 'multi') {
      for (let k = 0; k < q.a.length; k++) document.getElementById('eQ').querySelectorAll('.opt')[k].click();
    } else if (q.type === 'order' || q.type === 'build') {
      for (let k = 0; k < q.items.length; k++) {
        const pool = document.getElementById('eQ').querySelector('.oitem');
        if (pool) pool.click();
      }
    } else if (q.type === 'match') {
      for (let k = 0; k < q.pairs.length; k++) {
        const l = document.getElementById('eQ').querySelector('.mcol .mi:not(.bd)');
        if (l) l.click();
        const rightCol = document.getElementById('eQ').querySelectorAll('.mcol')[1];
        const r = rightCol && rightCol.querySelector('.mi:not(.tk)');
        if (r) r.click();
      }
    } else if (q.type === 'defect') {
      const idxs = q.lines.map((l, ix) => l.bad ? ix : -1).filter(ix => ix >= 0);
      for (const ix of idxs) {
        const rows = document.getElementById('eQ').querySelectorAll('.al');
        if (rows[ix]) rows[ix].click();
      }
    }
    const nextBtn = document.getElementById('eNext');
    if (nextBtn && !nextBtn.disabled) nextBtn.click();
  }

  const unanswered = exp.exState().qs.filter((q, i) => !fns.isAnswered(q, exp.exState().ans[i])).length;
  assert(unanswered === 0, `${unanswered} exam question(s) left unanswered before submit — submit would hit the confirm() dialog`);

  const historyLenBefore = exp.state().examHistory.length;
  document.getElementById('eSub').click();
  await tick(window);
  const historyLenAfter = exp.state().examHistory.length;
  assert(historyLenAfter === historyLenBefore + 1, `expected examHistory to grow by 1 after submit (was ${historyLenBefore}, now ${historyLenAfter})`);
  assert(document.getElementById('eBox').textContent.length > 0, 'exam results view appears empty after submit');

  assert(errors.length === 0, `${errors.length} runtime script error(s) during interaction: ${errors.map(e => e.message).join('; ')}`);

  return failures;
}

(async () => {
  const allFailures = [];
  const RUNS = 5; // exam selection is randomized — repeat to catch type-specific bugs
  for (let i = 0; i < RUNS; i++) {
    failures.length = 0;
    const f = await run(i);
    if (f.length) allFailures.push(`run ${i + 1}: ` + f.join(' | '));
  }
  if (allFailures.length) {
    console.error(`FAIL: browser interaction — failures across ${RUNS} run(s):`);
    allFailures.forEach(f => console.error(' -', f));
    process.exit(1);
  }
  console.log(`PASS: browser interaction — ${RUNS}/${RUNS} runs clean (tabs, flashcard, all 6 question types, full exam cycle, hover + accent)`);
})().catch(err => { console.error('FAIL: browser interaction threw:', err); process.exit(1); });
