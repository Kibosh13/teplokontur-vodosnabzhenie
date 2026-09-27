import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repository = 'teplokontur-vodosnabzhenie';
const source = path.resolve('site');
const output = path.resolve(process.argv[2] || '.pages');
const base = `/${repository}/`;

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

for (const file of await walk(output)) {
  if (!file.endsWith('.html')) continue;
  let html = await readFile(file, 'utf8');
  html = html.replace(
    /<meta name="viewport"[^>]*>/,
    (match) => `${match}<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">`,
  );
  html = html.replace(/(href|src)="\/(?!\/)/g, `$1="${base}`);
  html = html.replaceAll(', заявка принята.', ', это демоверсия — данные не отправлены.');
  await writeFile(file, html);
}

const appJs = path.join(output, 'assets', 'app.js');
let script = await readFile(appJs, 'utf8');
script = script.replace("button.textContent = 'Заявка принята ✓';", "button.textContent = 'Демо: данные не отправлены';");
await writeFile(appJs, script);

await writeFile(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
await writeFile(path.join(output, '.nojekyll'), '');

console.log(`GitHub Pages demo prepared in ${output}`);
