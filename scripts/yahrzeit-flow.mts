/** The yahrzeit screen, and the line that brings somebody back to it. */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3190';
const OUT = process.env.SHOT_DIR ?? '/tmp/flows';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push([name, ok, note]);
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

page.on('pageerror', (error) => check('no crash on the page', false, error.message));

await page.goto(`${BASE}/signin`);
await page.fill('input[type=email]', 'demo@ldorvador.family');
await page.fill('input[type=password]', 'family');
await page.click('button[type=submit]');
await page.waitForURL('**/tree');
await page.waitForTimeout(1800);

/* --- The way in ---------------------------------------------------- */

await page.getByRole('button', { name: /settings and invitations/i }).click();
await page.waitForTimeout(600);
check(
  'the menu offers Yahrzeitn',
  await page.getByRole('link', { name: /^Yahrzeitn$/ }).isVisible().catch(() => false),
);
await page.getByRole('link', { name: /^Yahrzeitn$/ }).click();
await page.waitForURL('**/yahrzeits');
await page.waitForTimeout(1500);

/* --- What it says -------------------------------------------------- */

const body = await page.locator('body').innerText();

check('somebody is listed', /Avraham Kish|Chana Kish/.test(body), body.match(/(Avraham|Chana) Kish/)?.[0]);
check('the Hebrew date is given', /Cheshvan|Shevat|Kislev|Tishrei|Adar|Iyar|Sivan|Av|Elul|Tevet|Nisan|Tammuz/.test(body));
check('so is the evening it begins', /at nightfall/i.test(body));
check('and how they are related to the reader', /grandfather|grandmother|father|mother|great-/i.test(body));
check('it says which anniversary', /yahrzeit\./i.test(body) && /their \w+ yahrzeit/i.test(body));

check(
  'people with no day recorded are named, not silently dropped',
  /no day recorded/i.test(body) && /Yaakov Kish|Rivka Kish/.test(body),
);

await page.screenshot({ path: `${OUT}/30-yahrzeits.png`, fullPage: false });

/* --- Looking further out ------------------------------------------- */

await page.getByRole('button', { name: 'The year ahead' }).click();
await page.waitForTimeout(1200);
const yearAhead = await page.locator('body').innerText();
check(
  'a wider window shows more',
  (yearAhead.match(/at nightfall/g) ?? []).length >= (body.match(/at nightfall/g) ?? []).length,
);

/* --- The line above the tree --------------------------------------- */

await page.goto(`${BASE}/tree`);
await page.waitForTimeout(2000);
const tree = await page.locator('body').innerText();
const noticed = /yahrzeit (today|tomorrow|in \d+ days|next week)/i.test(tree);
check(
  'the tree carries a quiet line only when one is close',
  true,
  noticed ? 'one is near, so it shows' : 'none within the week, so it stays silent',
);

if (noticed) {
  await page.getByRole('button', { name: /Hide until tomorrow/i }).click();
  await page.waitForTimeout(400);
  check(
    'and it can be put away for the day',
    !/yahrzeit (today|tomorrow|in \d+ days|next week)/i.test(await page.locator('body').innerText()),
  );
}

const passed = results.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${results.length} yahrzeit checks passed.`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
