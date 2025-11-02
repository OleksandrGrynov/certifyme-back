/* Strips all comments from .js files (excluding node_modules) using Babel parser/generator. */
const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');
const parser = require('@babel/parser');
const generate = require('@babel/generator').default;

const ROOT = process.cwd();

async function main() {
  const patterns = [
    '**/*.js',
    '!node_modules/**',
    '!scripts/strip-comments.js',
    '!**/*.min.js',
  ];

  const files = await fg(patterns, { cwd: ROOT, dot: true, absolute: true });
  let processed = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const code = fs.readFileSync(file, 'utf8');
      let shebang = '';
      let content = code;
      if (content.startsWith('#!')) {
        const firstNl = content.indexOf('\n');
        shebang = content.slice(0, firstNl + 1);
        content = content.slice(firstNl + 1);
      }

      const ast = parser.parse(content, {
        sourceType: 'unambiguous',
        allowReturnOutsideFunction: true,
        plugins: [
          'jsx',
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'optionalChaining',
          'nullishCoalescingOperator',
          'topLevelAwait',
          'objectRestSpread',
          'importMeta',
          'dynamicImport',
        ],
      });

      const output = generate(ast, { comments: false, retainLines: false }, content);
      const finalCode = shebang + output.code + (output.code.endsWith('\n') ? '' : '\n');
      if (finalCode !== code) {
        fs.writeFileSync(file, finalCode, 'utf8');
      }
      processed++;
    } catch (e) {
      console.error(`[strip-comments] Failed for ${path.relative(ROOT, file)}: ${e.message}`);
      failed++;
    }
  }

  console.log(`[strip-comments] Done. Processed: ${processed}, Failed: ${failed}, Total: ${files.length}`);
}

main().catch((e) => {
  console.error('[strip-comments] Fatal:', e);
  process.exit(1);
});
