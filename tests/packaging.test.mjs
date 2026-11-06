// Release packaging: the built site carries the project license, and the Pages workflow runs the real checks.
// Reading the workflow file proves its contents only. Whether it runs and deploys is shown by GitHub, not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const file = path => new URL(`../${path}`, import.meta.url);

test('public/LICENSE is an exact copy of the root MIT license', () => {
  assert.deepEqual(readFileSync(file('public/LICENSE')), readFileSync(file('LICENSE')));
});

test('every production build ships that license and the third-party notices unchanged', async () => {
  const outDir = fileURLToPath(file('test-output/packaging-dist'));
  await build({ root: fileURLToPath(file('')), logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  assert.deepEqual(readFileSync(`${outDir}/LICENSE`), readFileSync(file('LICENSE')));
  for (const notice of ['THIRD-PARTY-NOTICES.md', 'NotoSerifHebrew-OFL.txt', 'morphhb-LICENSE.md']) {
    assert.deepEqual(readFileSync(`${outDir}/notices/${notice}`), readFileSync(file(`public/notices/${notice}`)), notice);
  }
});

test('the Pages workflow runs every check before deploying, with pinned actions and least privilege', () => {
  const workflow = readFileSync(file('.github/workflows/pages.yml'), 'utf8');
  for (const action of ['actions/checkout@v7.0.1', 'actions/setup-node@v7.1.0', 'actions/configure-pages@v6.0.0', 'actions/upload-pages-artifact@v5.0.0', 'actions/deploy-pages@v5.0.1']) {
    assert.ok(workflow.includes(`uses: ${action}`), action);
  }
  const order = ['npm ci', 'npm test', 'npm run validate', 'npm run validate:opening', 'npm run build', 'actions/upload-pages-artifact', 'actions/deploy-pages'];
  const places = order.map(step => workflow.indexOf(step));
  assert.ok(places.every(place => place >= 0), `all steps present: ${places}`);
  assert.deepEqual(places, [...places].sort((a, b) => a - b), 'checks come before upload and deploy');
  for (const line of ['contents: read', 'pages: write', 'id-token: write', 'workflow_dispatch', 'branches: [main]', 'group: pages', 'name: github-pages', 'url: ${{ steps.deployment.outputs.page_url }}', 'path: dist']) {
    assert.ok(workflow.includes(line), line);
  }
});

test('private operations files stay out of the repository', () => {
  assert.ok(readFileSync(file('.gitignore'), 'utf8').split('\n').includes('ops/'));
});
