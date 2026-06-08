const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const mobileNav = read('src/components/layout/MobileAppNav.tsx');
const clientLayout = read('src/components/layout/ClientLayout.tsx');
const globals = read('src/app/globals.css');
const homePage = read('src/app/page.tsx');

const expectedTabs = [
  { key: 'projects', label: '\u6211\u7684\u9879\u76ee', href: '/?mobileTab=projects' },
  { key: 'contacts', label: '\u901a\u8baf\u5f55', href: '/?mobileTab=contacts' },
  { key: 'teams', label: '\u6211\u7684\u56e2\u961f', href: '/?mobileTab=teams' },
  { key: 'discover', label: '\u53d1\u73b0', href: '/?mobileTab=discover' },
  { key: 'me', label: '\u6211\u7684', href: '/?mobileTab=me' },
];

for (const tab of expectedTabs) {
  assert(mobileNav.includes(`key: '${tab.key}'`), `Missing mobile tab key: ${tab.key}`);
  assert(mobileNav.includes(`label: '${tab.label}'`), `Missing mobile tab label: ${tab.label}`);
  assert(mobileNav.includes(`href: '${tab.href}'`), `Missing mobile tab href: ${tab.href}`);
}

assert(mobileNav.includes('data-mobile-app-nav="true"'), 'Mobile nav data hook is missing.');
assert(mobileNav.includes('data-mobile-nav-indicator="true"'), 'Mobile nav active indicator hook is missing.');
assert(mobileNav.includes('data-mobile-nav-icon="true"'), 'Mobile nav icon hook is missing.');
assert(mobileNav.includes('data-mobile-nav-label="true"'), 'Mobile nav label hook is missing.');
assert(mobileNav.includes("export type MobileDisplayMode = 'normal' | 'care'"), 'Mobile display mode type is missing.');
assert(mobileNav.includes('MOBILE_DISPLAY_MODE_STORAGE_KEY'), 'Mobile display mode storage key is missing.');
assert(mobileNav.includes('useMobileDisplayMode'), 'Mobile display mode hook is missing.');
assert(mobileNav.includes('data-mobile-display-mode={displayMode}'), 'Mobile nav mode data hook is missing.');
assert(mobileNav.includes("localStorage.setItem(MOBILE_DISPLAY_MODE_STORAGE_KEY, mode)"), 'Mobile display mode must persist to localStorage.');
assert(mobileNav.includes("careMode ? 'min-h-[104px]"), 'Care mode must preserve large nav tap targets.');
assert(mobileNav.includes(": 'min-h-[62px]"), 'Normal mode must use WeChat-like compact nav height.');
assert(mobileNav.includes("careMode ? 'h-[clamp(48px,13vw,62px)] w-[clamp(48px,13vw,62px)]"), 'Care mode must preserve large responsive icons.');
assert(mobileNav.includes(": 'h-[28px] w-[28px]"), 'Normal mode must use compact nav icons.');
assert(mobileNav.includes("'h-[22px] w-[22px]'"), 'Compact inner nav icons must stay small.');
assert(mobileNav.includes('md:hidden'), 'Mobile nav must remain hidden on desktop.');
assert(mobileNav.includes("pathname.startsWith('/agent-tea-party')) return 'teams'"), 'Tea party must stay under the mobile teams tab.');
assert(mobileNav.includes("pathname.startsWith('/architectures')) return 'teams'"), 'Team pages must stay under the mobile teams tab.');
assert(mobileNav.includes("pathname.startsWith('/agent/') || pathname === '/agent'"), 'Single-agent pages must stay under the mobile contacts tab.');

assert(clientLayout.includes('MobileAppNav'), 'Client layout must render MobileAppNav.');
assert(clientLayout.includes('data-app-main="true"'), 'App main must expose a hook for mobile display mode padding.');
assert(clientLayout.includes('pb-0 md:pb-4'), 'Normal mobile content must avoid extra bottom padding without changing desktop.');
assert(clientLayout.includes("pathname.startsWith('/agent/') || pathname.startsWith('/agent-tea-party')"), 'Mobile chat routes must use a full-screen app shell.');

assert(globals.includes('@media (max-width: 767px)'), 'Mobile media query is missing.');
assert(globals.includes('body {\n    font-size: 16px;'), 'Normal mobile body font must be compact by default.');
assert(globals.includes('.text-\\[9px\\] { font-size: 11px !important; }'), 'Normal mobile 9px fallback must stay compact.');
assert(globals.includes('.text-\\[10px\\] { font-size: 12px !important; }'), 'Normal mobile 10px fallback must stay compact.');
assert(globals.includes('.text-\\[11px\\] { font-size: 12px !important; }'), 'Normal mobile 11px fallback must stay compact.');
assert(globals.includes('.text-\\[12px\\] { font-size: 13px !important; }'), 'Normal mobile 12px fallback must stay compact.');
assert(globals.includes('.text-\\[13px\\] { font-size: 13px !important; }'), 'Normal mobile 13px fallback must stay compact.');
assert(globals.includes('[data-mobile-app-nav="true"]'), 'Mobile nav CSS fallback selector is missing.');
assert(globals.includes('position: fixed;'), 'Mobile nav CSS fallback must force fixed positioning.');
assert(globals.includes('display: grid;'), 'Mobile nav CSS fallback must force grid layout.');
assert(globals.includes('grid-template-columns: repeat(5, minmax(0, 1fr));'), 'Mobile nav CSS fallback must keep five equal columns.');
assert(globals.includes('min-height: 62px;'), 'Normal mobile nav CSS fallback must be compact.');
assert(globals.includes('width: 28px;'), 'Normal mobile nav icon CSS fallback must be compact.');
assert(globals.includes('height: 28px;'), 'Normal mobile nav icon CSS fallback must be compact.');
assert(globals.includes('html[data-mobile-display-mode="care"] body'), 'Care mode CSS body override is missing.');
assert(globals.includes('html[data-mobile-display-mode="care"] [data-mobile-app-nav="true"]'), 'Care mode nav CSS override is missing.');
assert(globals.includes('html[data-mobile-display-mode="care"] [data-app-main="true"]'), 'Care mode main padding override is missing.');
assert(globals.includes('width: clamp(48px, 13vw, 62px);'), 'Care mode must preserve responsive icon width.');
assert(globals.includes('height: clamp(48px, 13vw, 62px);'), 'Care mode must preserve responsive icon height.');
assert(globals.includes('white-space: nowrap;'), 'Mobile nav labels must stay on one line.');

assert(homePage.includes('MobileDisplayModeSwitch'), 'Mobile Me page must expose display mode switch.');
assert(homePage.includes('data-mobile-display-settings="true"'), 'Display mode switch hook is missing.');
assert(homePage.includes('data-mobile-display-option={option.mode}'), 'Display mode option hooks are missing.');
assert(homePage.includes("title: '正常版'"), 'Normal mode option is missing.');
assert(homePage.includes("title: '关爱版'"), 'Care mode option is missing.');
assert(homePage.includes('onChange={setMobileDisplayMode}'), 'Display mode switch must update the shared mobile mode.');

console.log(JSON.stringify({
  mobileUiVerified: true,
  tabCount: expectedTabs.length,
  defaultMode: 'normal',
  normalBottomNavMinHeight: 62,
  careBottomNavMinHeight: 104,
  desktopLayoutProtected: true,
  displayModeSwitch: true,
  cssFallbackHooks: [
    'data-mobile-app-nav',
    'data-mobile-nav-icon',
    'data-mobile-nav-label',
  ],
}, null, 2));
