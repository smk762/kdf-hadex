const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'kdf-styles.css');
const outPath = path.join(__dirname, '..', 'src', 'styles', 'kdf-styles.js');

try{
  const css = fs.readFileSync(cssPath, 'utf8');
  const content = `import { css } from 'lit';\n\nexport const kdfStyles = css` + "`" + css + "`\n\nexport default kdfStyles;\n";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
  console.log('Wrote', outPath);
}catch(e){
  console.error('gen-styles failed', e);
  process.exit(1);
}
