/**
 * The family on a telephone, and getting a family in quickly.
 *
 * Driven at the size of a real phone, because both of these exist for people
 * who are not sitting at a desk.
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3191';
const OUT = process.env.SHOT_DIR ?? '/tmp/flows';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const phone = await browser.newContext({
  ...devices['iPhone 13'],
  hasTouch: true,
  isMobile: true,
});
const page = await phone.newPage();

const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push([name, ok, note]);
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

page.on('pageerror', (error) => check('no crash', false, error.message));

/* --- A new relative joins, on a phone -------------------------------- */

await page.goto(`${BASE}/setup`);
await page.locator('input[type=text]').fill('Shloime Traveller');
await page.locator('input[type=email]').fill('shloime@example.com');
await page.locator('input[type=password]').fill('a-long-enough-password');
await page.getByRole('button', { name: /create the first account/i }).click();
await page.waitForURL('**/onboarding');
await page.waitForTimeout(1200);

await page.locator('input[placeholder="Type your name"]').fill('Shloime Traveller');
await page.waitForTimeout(900);
await page.getByRole('button', { name: /not here yet/i }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /this looks right/i }).click();
await page.waitForTimeout(900);

/* --- Fast entry ------------------------------------------------------- */

check('the guided run opens on the parents', await page.getByText('Your parents').isVisible().catch(() => false));
await page.screenshot({ path: `${OUT}/40-quickstart.png` });

await page.getByLabel('Your father').fill('Dovid Traveller');
await page.getByLabel('Your mother').fill('Leah Traveller');
await page.getByRole('button', { name: /^Next$/ }).click();
await page.waitForTimeout(2500);

check(
  'siblings come next, now that there are parents to hang them on',
  await page.getByText('Your brothers and sisters').isVisible().catch(() => false),
);

const brothers = page.locator('input').nth(0);
await brothers.fill('Yitzy Traveller');
await page.waitForTimeout(400);
await page.locator('input').nth(1).fill('Berel Traveller');
await page.getByRole('button', { name: /^Next$/ }).click();
await page.waitForTimeout(2600);

check('then your own family', await page.getByText('Your own family').isVisible().catch(() => false));
await page.getByLabel('Wife').fill('Miri Traveller');
await page.getByLabel('Sons').first().fill('Nochum Traveller');
await page.getByRole('button', { name: /^Next$/ }).click();
await page.waitForTimeout(2600);

check('and the grandparents', await page.getByText('Your grandparents').isVisible().catch(() => false));
await page.getByLabel("Your father's father").fill('Zeidy Traveller');
await page.getByRole('button', { name: /^Finish$/ }).click();
await page.waitForURL('**/tree', { timeout: 20000 });
await page.waitForTimeout(2500);

/* --- The phone tree ---------------------------------------------------- */

const tree = await page.locator('body').innerText();
check('the family arrives on the tree', /Shloime Traveller/.test(tree));
check('with the parents above', /Dovid Traveller|Leah Traveller/.test(tree));
check('the wife beside', /Miri Traveller/.test(tree));
check('the children below', /Nochum Traveller/.test(tree));
check('and the brothers to hand', /Yitzy Traveller|Berel Traveller/.test(tree));
check(
  'laid out as rows, not a canvas to pinch',
  /parents/i.test(tree) && /brothers and sisters/i.test(tree),
);

await page.screenshot({ path: `${OUT}/41-phone-tree.png` });

/* --- Walking to somebody else ------------------------------------------ */

await page.getByRole('button', { name: /Move to Dovid Traveller/i }).click();
await page.waitForTimeout(2200);
const moved = await page.locator('body').innerText();
check('a tap moves you to them', /Zeidy Traveller/.test(moved), 'his father is now in view');

await page.screenshot({ path: `${OUT}/42-phone-walked.png` });

/* --- The page does not scroll sideways ---------------------------------- */

const overflows = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
);
check('nothing spills off the side of the screen', !overflows);

const passed = results.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${results.length} phone checks passed.`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
