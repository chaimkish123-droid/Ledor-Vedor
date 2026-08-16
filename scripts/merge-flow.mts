/** Create a duplicate the way a real import would, then combine it away. */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3150';
const OUT = '/tmp/flows';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push([name, ok, note]);
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

await page.goto(`${BASE}/signin`);
await page.fill('input[type=email]', 'demo@ldorvador.family');
await page.fill('input[type=password]', 'family');
await page.click('button[type=submit]');
await page.waitForURL('**/tree');

// Import a cousin's file, choosing *not* to join a person we already have —
// exactly how a family ends up with someone recorded twice.
await page.goto(`${BASE}/import`);
await page.waitForTimeout(800);
await page.setInputFiles('#gedcom-file', '/tmp/ged/duplicate.ged');
await page.waitForTimeout(2000);

const sameChecks = page.getByRole('checkbox');
const count = await sameChecks.count();
for (let i = 0; i < count; i++) {
  if (await sameChecks.nth(i).isChecked()) await sameChecks.nth(i).uncheck();
}
await page.getByRole('button', { name: /Bring \d+ people into the family/ }).click();
await page.waitForTimeout(2500);

// The archive now holds Ruth Shapiro twice.
await page.goto(`${BASE}/merge`);
await page.waitForTimeout(1800);
const listed = await page.getByText(/Ruth Shapiro/).first().isVisible().catch(() => false);
check('the duplicate is found without anyone going looking', listed);
await page.screenshot({ path: `${OUT}/30-merge-list.png` });

await page.getByRole('button', { name: 'Compare' }).first().click();
await page.waitForTimeout(1200);
const sideBySide = await page.getByText('This record stays').isVisible().catch(() => false);
check('the two records are shown side by side', sideBySide);
const movesAcross = await page.getByText(/What moves across/).isVisible().catch(() => false);
check('it says what will move across', movesAcross);
await page.screenshot({ path: `${OUT}/31-merge-compare.png` });

await page.getByRole('button', { name: 'Combine into one person' }).click();
await page.waitForTimeout(2500);

const merged = await page.getByText(/is one person again/).isVisible().catch(() => false);
check('the merge reports what happened', merged);
const backup = await page.getByText(/saved as family-/).isVisible().catch(() => false);
check('and names the backup taken beforehand', backup);
await page.screenshot({ path: `${OUT}/32-merge-done.png` });

// Both names still find her, and she is one person on the tree.
await page.goto(`${BASE}/tree`);
await page.waitForTimeout(1200);
await page.fill('input[type=search]', 'Ruth Shapiro');
await page.waitForTimeout(1000);
const hits = await page.locator('ul[role=listbox] li').count();
check('there is one Ruth Shapiro now, not two', hits === 1, `${hits} found`);
await page.screenshot({ path: `${OUT}/33-merge-after.png` });

await page.fill('input[type=search]', 'Ruthie');
await page.waitForTimeout(1000);
const byOtherName = await page.getByText('Ruth Shapiro').first().isVisible().catch(() => false);
check('the name the other record used still finds her', byOtherName);

// Nothing is offered twice.
await page.goto(`${BASE}/merge`);
await page.waitForTimeout(1800);
const stillListed = await page.getByText(/Ruth Shapiro/).first().isVisible().catch(() => false);
check('and she is no longer offered as a duplicate', !stillListed);

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} merge checks passed.`);
if (failed.length) process.exitCode = 1;
