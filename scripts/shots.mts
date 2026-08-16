/** Drive the real app in a browser and capture what a family member would see. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.SHOT_DIR ?? '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const problems: string[] = [];
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));

const shot = async (name: string) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`· ${name}`);
};

await page.goto(`${BASE}/`);
await shot('01-welcome');

await page.goto(`${BASE}/signin`);
await page.fill('input[type=email]', 'demo@ldorvador.family');
await page.fill('input[type=password]', 'family');
await page.click('button[type=submit]');
await page.waitForURL('**/tree');
await page.waitForTimeout(1600);
await shot('02-my-branch');

// Open the quick view on a person by clicking their card.
await page.getByRole('button', { name: /David Kish/ }).first().click();
await shot('03-quick-view');

// Move the tree to David — the remarriage case.
await page.getByRole('button', { name: /Centre on David/ }).click();
await page.waitForTimeout(1600);
await shot('04-remarriage');

// Search.
await page.fill('input[type=search]', 'Ruth');
await page.waitForTimeout(700);
await shot('05-search');
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);
await shot('06-nine-children');

// Expand the collapsed sibling group.
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const more = page.getByRole('button', { name: /Show \d+ more/ });
if (await more.count()) {
  await more.first().click();
  await page.waitForTimeout(900);
  await shot('07-expanded');
}

// Relationship finder.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'How are we related?' }).first().click();
await page.waitForTimeout(400);
const toInput = page.getByLabel('To person');
await toInput.fill('Sarah Weiss');
await page.waitForTimeout(700);
await page.getByRole('button', { name: /Sarah Weiss/ }).last().click();
await page.waitForTimeout(900);
await shot('08-relationship-finder');

const showConnection = page.getByRole('button', { name: /Show the connection/ });
if (await showConnection.count()) {
  await showConnection.click();
  await page.waitForTimeout(1200);
  await shot('09-connection-path');
}

// Full profile.
await page.goto(`${BASE}/tree`);
await page.waitForTimeout(1400);
await page.getByRole('button', { name: /Avraham Kish/ }).first().click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(600);
const profile = page.getByRole('link', { name: 'Full profile' });
if (await profile.count()) {
  await profile.click();
  await page.waitForTimeout(1200);
  await shot('10-profile-top');
  await page.evaluate(() => window.scrollTo(0, 900));
  await shot('11-profile-legacy');
}

// Phone.
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  storageState: await context.storageState(),
});
const mobile = await phone.newPage();
await mobile.goto(`${BASE}/tree`);
await mobile.waitForTimeout(1800);
await mobile.screenshot({ path: `${OUT}/12-phone-tree.png` });
console.log('· 12-phone-tree');
await mobile.getByRole('button', { name: /Michael Kish/ }).first().click().catch(() => {});
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: `${OUT}/13-phone-sheet.png` });
console.log('· 13-phone-sheet');

await browser.close();

if (problems.length) {
  console.log('\nBrowser problems:');
  for (const problem of [...new Set(problems)]) console.log(' !', problem);
} else {
  console.log('\nNo console or page errors.');
}
