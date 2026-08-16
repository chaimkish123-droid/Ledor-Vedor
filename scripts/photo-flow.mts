/** Add a portrait the way a family member would, and check it lands everywhere. */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3140';
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

// Before: every card is a monogram, and that is a finished design.
await page.screenshot({ path: `${OUT}/20-before-photos.png` });
const monogramsOnly = (await page.locator('main img').count()) === 0;
check('the tree is complete with no photographs at all', monogramsOnly);

// Add one to Avraham.
await page.fill('input[type=search]', 'Avraham');
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
await page.waitForTimeout(1600);

await page.getByRole('button', { name: /(Add|Change) a photograph|Change photograph/ }).first().click();
await page.waitForTimeout(500);
await page.setInputFiles('#photo-file', '/tmp/ged/portrait.png');
await page.waitForTimeout(700);
await page.getByLabel('Caption').fill('Outside the print shop');
await page.getByLabel('When').fill('c. 1958');
await page.screenshot({ path: `${OUT}/21-photo-upload.png` });

await page.getByRole('button', { name: 'Add the photograph' }).click();
await page.waitForTimeout(2500);

const inPanel = await page.locator('aside img').count();
check('the photograph appears in the panel', inPanel > 0);
await page.screenshot({ path: `${OUT}/22-photo-in-panel.png` });

// The card on the canvas now carries a face.
const onCard = await page.locator('main img[src*="size=thumb"]').count();
check('the card on the tree shows their face', onCard > 0);

// And so does search.
await page.fill('input[type=search]', 'Avraham');
await page.waitForTimeout(900);
const inSearch = await page.locator('ul[role=listbox] img').count();
check('search results show it too', inSearch > 0);
await page.screenshot({ path: `${OUT}/23-photo-in-search.png` });
await page.keyboard.press('Escape');
await page.fill('input[type=search]', '');
await page.waitForTimeout(600);

// The profile: portrait plus the controls that replaced the gallery.
await page.locator('main').getByRole('button', { name: /Avraham Kish/ }).first().click();
await page.waitForSelector('aside', { timeout: 10000 });
await page.waitForTimeout(700);
await page.getByRole('link', { name: 'Full profile' }).click();
await page.waitForURL('**/person/**', { timeout: 10000 });
await page.waitForTimeout(1200);

const onProfile = await page.locator('main img').count();
check('the profile shows the portrait', onProfile > 0);
const caption = await page.getByText(/Outside the print shop/).isVisible().catch(() => false);
check('with the caption it was given', caption);
await page.screenshot({ path: `${OUT}/24-photo-profile.png` });

// Editing details from the profile, which previously was not possible at all.
await page.getByRole('button', { name: 'Edit details' }).click();
await page.waitForTimeout(600);
await page.getByLabel('Born').fill('11 March 1915');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(1800);
const edited = await page.getByText(/March 11, 1915/).first().isVisible().catch(() => false);
check('details can be corrected from the profile', edited);
await page.screenshot({ path: `${OUT}/25-profile-edit.png` });

// Removing the portrait puts the monogram back.
await page.getByRole('button', { name: 'Remove photograph' }).click();
await page.waitForTimeout(2000);
const backToMonogram = (await page.locator('main img').count()) === 0;
check('removing it returns them to their monogram', backToMonogram);

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} photograph checks passed.`);
if (failed.length) process.exitCode = 1;
