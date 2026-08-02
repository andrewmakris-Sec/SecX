// Runs the five required checks in order and fails fast on the first
// non-zero exit, mirroring the sequence in the project brief.
const { execFileSync } = require('child_process');
const path = require('path');

const checks = [
  '01-syntax.js',
  '02-css.js',
  '03-content-integrity.js',
  '04-browser-interaction.js',
  '05-persistence.js',
];

for (const c of checks) {
  const file = path.join(__dirname, 'checks', c);
  console.log(`\n=== ${c} ===`);
  try {
    const out = execFileSync(process.execPath, [file], { encoding: 'utf8' });
    process.stdout.write(out);
  } catch (e) {
    process.stdout.write(e.stdout || '');
    process.stderr.write(e.stderr || '');
    console.error(`\n${c} FAILED`);
    process.exit(1);
  }
}
console.log('\nAll checks passed.');
