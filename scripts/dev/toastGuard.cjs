/**
 * The toast's action (Undo, "Today", ...) takes no press in its first TOAST_ACTION_GUARD_MS on screen
 * (src/ui/Toast.tsx), so a quick second tap meant for the button under it never undoes the first.
 * A script that taps `toast-action` right after a toast appears waits for that here, in one place:
 *
 *   const { toastActionReady, TOAST_GUARD_MS } = require('./toastGuard.cjs');
 *   await toastActionReady(page);            // page or frame: the action is visible and past its guard
 *   await page.getByTestId('toast-action').first().click();
 *
 * The number is read from Toast.tsx, so the two never drift apart.
 */
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', 'Toast.tsx'), 'utf8');
const found = /TOAST_ACTION_GUARD_MS = (\d+)/.exec(source);
if (!found) throw new Error('toastGuard.cjs: TOAST_ACTION_GUARD_MS is not in src/ui/Toast.tsx any more');
const TOAST_GUARD_MS = Number(found[1]);

/**
 * Waits until the toast's action on `where` (a Playwright page or frame) is visible, then for longer than
 * the guard from that moment, so a tap after it always counts. A toast seen long before costs the same short
 * wait, which keeps this one rule simple.
 */
async function toastActionReady(where, timeout = 15000) {
  await where.locator('[data-testid="toast-action"]').first().waitFor({ state: 'visible', timeout });
  await where.waitForTimeout(TOAST_GUARD_MS + 100);
}

module.exports = { TOAST_GUARD_MS, toastActionReady };
