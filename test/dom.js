// Shared jsdom loader. Loads the *real* HTML file (so every getElementById
// call in the app resolves against real markup) and injects one extra
// statement at the very end of the inline <script> — in the same top-level
// lexical scope as the app's `const`/`let` declarations — so the test suite
// can reach otherwise-unexported bindings (top-level const/let does not
// attach to `window`, only `var`/function declarations do).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', 'securityx-readiness.html');

const EXPORT_STMT = `
window.__EXPORT__ = {
  data: {COURSE, FLASHCARDS, QUESTIONS, NOTES, TRACKS, OBJECTIVES, SCOPE_NOTE,
         PS_COURSES, PS_LABS, CRAM, DOMAINS, SRS_DAYS, DAY, K, FLAT, DECKS, DEFAULT_AC},
  fns: {isCorrect, isAnswered, blankAns, defectIdx, qBox, qDue, qNeedsWork,
        adaptiveQueue, TYPE_LABEL, multiNeed, NEEDWORD, shuf, esc, fcMastery,
        qAcc, lessonRatio, domainScore, readiness, D, dk, streak, todayKey,
        pick, eStart, eSubmit, eIdle, eReview, renderQ, renderLesson, renderCourse,
        setAccent, curLesson, lessonsIn, doneIn, courseRatio},
  state: () => ({fcState, qState, examHistory, psProgress, lessonDone, studyDays, examDate, BACKEND}),
  exState: () => ex,
};
`;

function buildHtml() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const idx = html.lastIndexOf('</script>');
  if (idx === -1) throw new Error('no </script> tag found in ' + HTML_PATH);
  return html.slice(0, idx) + EXPORT_STMT + html.slice(idx);
}

/**
 * Loads the app in jsdom. Resolves once the async init IIFE has settled.
 * opts.storage: {key: rawJsonString} to seed localStorage before scripts run.
 * opts.onError: callback(err) for uncaught script errors / rejections.
 */
async function loadApp(opts = {}) {
  const html = buildHtml();
  const errors = [];
  const virtualConsole = new (require('jsdom').VirtualConsole)();
  virtualConsole.on('jsdomError', (err) => errors.push(err));

  const dom = new JSDOM(html, {
    url: opts.url || 'https://example.org/securityx-readiness.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      if (opts.storage) {
        for (const [k, v] of Object.entries(opts.storage)) {
          window.localStorage.setItem(k, v);
        }
      }
    },
  });

  // The init IIFE awaits loadAll() (a microtask chain); give it a few ticks.
  await new Promise((r) => dom.window.setTimeout(r, 30));

  return { dom, window: dom.window, document: dom.window.document, exp: dom.window.__EXPORT__, errors };
}

module.exports = { loadApp, HTML_PATH };
