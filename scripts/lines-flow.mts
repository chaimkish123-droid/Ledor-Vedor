/**
 * One line from both parents.
 *
 * The way most families get entered: a person adds their father first, then
 * goes to the father and adds his wife. Before, the child kept hanging from
 * the father alone. Now the form asks, and the child hangs from the marriage.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3196';
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
page.on('pageerror', (error) => check('no crash', false, error.message));

/* --- A first account, with nothing but a father ------------------------ */

await page.goto(`${BASE}/setup`);
await page.locator('input[type=text]').fill('Chaim Example');
await page.locator('input[type=email]').fill('chaim@example.com');
await page.locator('input[type=password]').fill('a-long-enough-password');
await page.getByRole('button', { name: /create the first account/i }).click();
await page.waitForURL('**/onboarding');
await page.waitForTimeout(1200);
await page.locator('input[placeholder="Type your name"]').fill('Chaim Example');
await page.waitForTimeout(900);
await page.getByRole('button', { name: /not here yet/i }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /this looks right/i }).click();
await page.waitForTimeout(900);

// Only the father, the way many people start.
await page.getByLabel('Your father').fill('Yitzchok Example');
await page.getByRole('button', { name: /^Next$/ }).click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /Skip this/ }).click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: /Skip this/ }).click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: /Finish without these/ }).click();
await page.waitForURL('**/tree', { timeout: 20000 });
await page.waitForTimeout(2500);

const graph = async () => (await page.request.get(`${BASE}/api/graph`)).json();
const me = (await graph()).focusId as string;
const before = await graph();
const father = before.slice.parentEdges.find((e: { childId: string }) => e.childId === me).parentId as string;
check('to begin with, the child hangs from the father alone', before.slice.parentEdges.filter((e: { childId: string }) => e.childId === me).length === 1);

/* --- Now the mother, added as the father's wife ------------------------- */

await page.getByRole('button', { name: /^Yitzchok Example/ }).first().click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /^Add spouse$/ }).click();
await page.waitForTimeout(1200);

check(
  'the form offers to make her the mother of the children he already has',
  await page.getByText(/Also the parent of/).isVisible().catch(() => false),
);
const box = page.getByRole('checkbox').first();
check('ticked by default, because this is his first marriage', await box.isChecked());
await page.screenshot({ path: `${OUT}/50-spouse-claims-children.png` });

await page.getByPlaceholder('Their full name').fill('Miriam Example');
await page.getByRole('button', { name: /^Female$/ }).click();
await page.getByRole('button', { name: /Add Miriam to the family/ }).click();
await page.waitForTimeout(2500);

const after = await graph();
const edges = after.slice.parentEdges.filter((e: { childId: string }) => e.childId === me);
const unions = new Set(edges.map((e: { unionId: string | null }) => e.unionId));
check('the child now has two parents', edges.length === 2, `${edges.length} parent links`);
check(
  'and both links carry the same marriage, so one line comes down from between them',
  edges.length === 2 && unions.size === 1 && !unions.has(null),
);

/* --- And the drawing agrees ------------------------------------------ */

await page.keyboard.press('Escape');
await page.goto(`${BASE}/tree`);
await page.waitForTimeout(2500);
const lines = await page.evaluate(() =>
  Array.from(document.querySelectorAll('svg path[data-descent], svg path.descent, svg path')).length,
);
check('lines are drawn', lines > 0, `${lines} paths`);
await page.screenshot({ path: `${OUT}/51-one-line-from-both.png` });

void father;
const passed = results.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${results.length} line checks passed.`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
