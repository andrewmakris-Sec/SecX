// Check 1: Syntax — node --check on the extracted inline JS.
require('../extract.js');
const { execSync } = require('child_process');

try {
  execSync('node --check /tmp/app.js', { stdio: 'pipe' });
  console.log('PASS: syntax check (node --check)');
} catch (e) {
  console.error('FAIL: syntax check');
  console.error(e.stderr ? e.stderr.toString() : e.message);
  process.exit(1);
}
