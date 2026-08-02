// Check 2: CSS parse — css-tree must report 0 errors, and every var(--x) must
// reference a declared custom-property token.
const csstree = require('css-tree');
const { css } = require('../extract.js');

let errors = [];
const ast = csstree.parse(css, {
  onParseError(error) { errors.push(error.formattedMessage || String(error)); }
});

if (errors.length) {
  console.error('FAIL: CSS parse errors:');
  errors.forEach(e => console.error(e));
  process.exit(1);
}

const declared = new Set();
csstree.walk(ast, (node) => {
  if (node.type === 'Declaration' && node.property && node.property.startsWith('--')) {
    declared.add(node.property);
  }
});

const referenced = new Set();
csstree.walk(ast, (node) => {
  if (node.type === 'Function' && node.name === 'var' && node.children && node.children.first) {
    const first = node.children.first;
    if (first.type === 'Identifier' && first.name.startsWith('--')) {
      referenced.add(first.name);
    }
  }
});

const undeclared = [...referenced].filter(v => !declared.has(v));
if (undeclared.length) {
  console.error('FAIL: undeclared CSS custom properties referenced via var():');
  undeclared.forEach(v => console.error(' ', v));
  process.exit(1);
}

console.log(`PASS: CSS parse — 0 errors, ${declared.size} tokens declared, ${referenced.size} referenced, all resolved`);
