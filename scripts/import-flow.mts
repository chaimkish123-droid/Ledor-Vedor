/** Drive the import screen the way an administrator would. */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3130';
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

await page.goto(`${BASE}/import`);
await page.waitForTimeout(800);
await page.setInputFiles('#gedcom-file', '/tmp/ged/cousins.ged');
await page.waitForTimeout(1800);

const previewShown = await page.getByText(/3 people in cousins\.ged/).isVisible().catch(() => false);
check('the preview says what the file contains', previewShown);
await page.screenshot({ path: `${OUT}/10-import-preview.png` });

const source = await page.getByText(/exported from Ancestry/).isVisible().catch(() => false);
check('it names the program the file came from', source);

const confirm = page.getByRole('button', { name: /Bring 3 people into the family/ });
check('nothing is imported until it is confirmed', (await confirm.count()) > 0);

await confirm.click();
await page.waitForTimeout(2500);

const done = await page.getByText('The family has grown').isVisible().catch(() => false);
check('the import reports what it did', done);
const backupNoted = await page.getByText(/saved as family-/).isVisible().catch(() => false);
check('and names the backup taken beforehand', backupNoted);
await page.screenshot({ path: `${OUT}/11-import-done.png` });

// The imported people are really in the tree, with their Hebrew date converted.
await page.goto(`${BASE}/tree`);
await page.waitForTimeout(1200);
await page.fill('input[type=search]', 'Yehuda');
await page.waitForTimeout(900);
const found = await page.getByText('Yehuda Kish').first().isVisible().catch(() => false);
check('imported people are searchable straight away', found);
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/12-imported-in-tree.png` });

const hebrewBirth = await page.getByText(/1943/).first().isVisible().catch(() => false);
check('a Hebrew-calendar birth landed on the right civil year', hebrewBirth, '3 Kislev 5704 → Dec 1943');

// Re-importing the same file should now notice they are already here.
await page.goto(`${BASE}/import`);
await page.waitForTimeout(700);
await page.setInputFiles('#gedcom-file', '/tmp/ged/cousins.ged');
await page.waitForTimeout(2000);
const noticed = await page.getByText(/may already be here/).isVisible().catch(() => false);
check('a second import notices the people already here', noticed);
await page.screenshot({ path: `${OUT}/13-import-duplicates.png` });

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} import checks passed.`);
if (failed.length) process.exitCode = 1;
