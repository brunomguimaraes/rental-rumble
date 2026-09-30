/**
 * Install guide platform detection: each device must get the steps that work
 * on it. iPadOS reports a Mac user agent, so touch points decide.
 *
 *   npx --yes tsx scripts/install.test.ts
 */
import { detectInstallPlatform } from '../src/install.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

console.log('[1] detectInstallPlatform');
check('iPhone gets iOS steps', detectInstallPlatform({ userAgent: UA.iphone, maxTouchPoints: 5 }) === 'ios');
check('iPad with a desktop user agent gets iOS steps', detectInstallPlatform({ userAgent: UA.ipadDesktop, maxTouchPoints: 5 }) === 'ios');
check('a Mac without touch is desktop', detectInstallPlatform({ userAgent: UA.mac, maxTouchPoints: 0 }) === 'desktop');
check('Android gets Android steps', detectInstallPlatform({ userAgent: UA.android, maxTouchPoints: 5 }) === 'android');
check('Windows is desktop', detectInstallPlatform({ userAgent: UA.windows, maxTouchPoints: 0 }) === 'desktop');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
