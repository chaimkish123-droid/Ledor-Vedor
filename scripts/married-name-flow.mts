/**
 * Adding a wife the way a family member would, and checking she keeps both
 * names: the one everybody calls her, and the one she was born with.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3180';
const OUT = '/tmp/flows';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
await page.waitForTimeout(1500);

/* --- Add a brother, then a wife for him ---------------------------- */

await page.getByRole('button', { name: /Michael Kish/ }).first().click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: /Add sibling/i }).click();
await page.waitForTimeout(500);
await page.getByLabel('Name').fill('Shmuel Kish');
await page.getByRole('button', { name: 'Male', exact: true }).click();
await page.getByRole('button', { name: /to the family$/i }).click();
await page.waitForTimeout(2000);

await page.getByRole('button', { name: /Shmuel Kish/ }).first().click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: /Add spouse/i }).click();
await page.waitForTimeout(500);

await page.getByLabel('Name').fill('Rivka Goldberger');
await page.getByRole('button', { name: 'Female', exact: true }).click();
await page.waitForTimeout(400);

const offered = await page
  .getByText(/took the Kish name when they married/i)
  .isVisible()
  .catch(() => false);
check('adding a wife asks whether she took the family name', offered);

const preview = await page
  .getByText(/Recorded as Rivka Kish, born Rivka Goldberger/i)
  .isVisible()
  .catch(() => false);
check('and says plainly what will be recorded', preview);

await page.screenshot({ path: `${OUT}/20-married-name.png` });
await page.getByRole('button', { name: /to the family$/i }).click();
await page.waitForTimeout(2500);

/* --- She is on the tree under her married name --------------------- */

const onTree = await page.getByText('Rivka Kish').first().isVisible().catch(() => false);
check('she appears under her married name', onTree);

/* --- And is findable under the name she was born with -------------- */

const search = page.locator('input[type=search], input[placeholder*="Search" i]').first();
await search.fill('Goldberger');
await page.waitForTimeout(1200);
const byMaiden = await page.getByText(/Rivka Kish/).first().isVisible().catch(() => false);
check('a relative who only knew her maiden name still finds her', byMaiden);

/* --- Her profile says where she came from -------------------------- */

await search.fill('');
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Rivka Kish/ }).first().click();
await page.waitForTimeout(1200);
const bornAs = await page
  .getByText(/Rivka Goldberger/)
  .first()
  .isVisible()
  .catch(() => false);
check('and her panel records the name she was born with', bornAs);

const passed = results.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${results.length} married-name checks passed.`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
