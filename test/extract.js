const fs = require('fs');
const path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', 'securityx-readiness.html'), 'utf8');
const js = s.split('<script>')[1].split('</script>')[0];
const styleMatch = s.match(/<style>([\s\S]*?)<\/style>/);
const css = styleMatch ? styleMatch[1] : '';
fs.writeFileSync('/tmp/app.js', js);
fs.writeFileSync('/tmp/app.css', css);
module.exports = { html: s, js, css };
