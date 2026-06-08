const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const url = process.env.MOBILE_RENDER_URL || process.argv[2] || 'http://localhost:3010';
const parsedUrl = new URL(url);
const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  allowedHosts.has(parsedUrl.hostname),
  `Refusing to run browser smoke against non-local URL: ${url}`
);

const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const cliPrefix = ['--yes', '--package', '@playwright/cli', 'playwright-cli'];

function quoteCmdArg(arg) {
  const value = String(arg);
  if (!/[\s&()<>^|"]/g.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function runCli(args, allowFailure = false) {
  const bin = process.platform === 'win32' ? 'cmd.exe' : npxBin;
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/c', [npxBin, ...cliPrefix, ...args].map(quoteCmdArg).join(' ')]
    : [...cliPrefix, ...args];
  try {
    return execFileSync(bin, commandArgs, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_loglevel: 'error',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (allowFailure) return '';
    const stdout = error.stdout ? String(error.stdout) : '';
    const stderr = error.stderr ? String(error.stderr) : '';
    throw new Error([
      `playwright-cli ${args.join(' ')} failed`,
      error.code ? `code=${error.code}` : '',
      Number.isInteger(error.status) ? `status=${error.status}` : '',
      error.signal ? `signal=${error.signal}` : '',
      stdout,
      stderr,
    ].filter(Boolean).join('\n'));
  }
}

function parseRunCodeJson(output) {
  const match = output.match(/### Result\s*\r?\n([\s\S]*?)\r?\n### Ran Playwright code/);
  assert(match, `Unable to parse Playwright result:\n${output}`);
  return JSON.parse(JSON.parse(match[1].trim()));
}

function parseConsoleCounts(output) {
  const match = output.match(/Total messages:\s*\d+\s*\(Errors:\s*(\d+),\s*Warnings:\s*(\d+)\)/);
  assert(match, `Unable to parse console output:\n${output}`);
  return {
    errors: Number(match[1]),
    warnings: Number(match[2]),
  };
}

const probeFile = path.join(os.tmpdir(), `openclaw-mobile-render-${process.pid}.js`);

fs.writeFileSync(
  probeFile,
  `async (page) => {
  const storageKey = 'openclaw.mobileDisplayMode';

  async function stubBackendApi() {
    await page.route('**/api/agents/caves**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ caves: [] }),
      });
    });
    await page.route('**/api/agents**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ agents: [] }),
      });
    });
    await page.route('**/api/projects**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });
    await page.route('**/api/architectures**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ architectures: [] }),
      });
    });
    await page.route('**/api/market/coze**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [],
          runtime: { apiBase: 'https://api.coze.test', configured: false },
        }),
      });
    });
  }

  await page.addInitScript((key) => {
    window.localStorage.setItem(
      'lobster-auth',
      JSON.stringify({
        state: {
          token: 'mobile-render-smoke-token',
          user: {
            id: 'mobile-render-smoke-user',
            email: 'mobile-render-smoke@example.test',
            username: 'mobile-render-smoke',
          },
        },
        version: 0,
      })
    );
    window.localStorage.setItem(
      'openclaw.officialAdoptPrompt.mobile-render-smoke-user',
      'smoke-test-seen'
    );
    window.localStorage.setItem(
      'openclaw.officialAdoptPrompt.v2.mobile-render-smoke-user',
      'smoke-test-seen'
    );
    window.localStorage.setItem(
      'openclaw.mobileOfficialAdoptPrompt.mobile-render-smoke-user',
      'smoke-test-seen'
    );
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, 'normal');
    }
  }, storageKey);

  async function waitForMode(mode) {
    await page.waitForFunction((expectedMode) => {
      const nav = document.querySelector('[data-mobile-app-nav="true"]');
      return nav?.getAttribute('data-mobile-display-mode') === expectedMode;
    }, mode, { timeout: 10000 });
  }

  function readMetrics() {
    const nav = document.querySelector('[data-mobile-app-nav="true"]');
    const main = document.querySelector('[data-app-main="true"]');
    const settings = document.querySelector('[data-mobile-display-settings="true"]');
    const icons = [...document.querySelectorAll('[data-mobile-nav-icon="true"]')];
    const labels = [...document.querySelectorAll('[data-mobile-nav-label="true"]')];
    const navBox = nav?.getBoundingClientRect();
    const mainStyle = main ? getComputedStyle(main) : null;
    return {
      mode: nav?.getAttribute('data-mobile-display-mode') || null,
      htmlMode: document.documentElement.dataset.mobileDisplayMode || null,
      viewport: { width: innerWidth, height: innerHeight },
      nav: navBox ? { top: navBox.top, bottom: navBox.bottom, height: navBox.height } : null,
      iconSizes: icons.map((el) => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
      labelSizes: labels.map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          text: el.textContent,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          fontSize: Number.parseFloat(style.fontSize),
          visible: rect.top >= 0 && rect.bottom <= innerHeight,
        };
      }),
      mainPaddingBottom: mainStyle?.paddingBottom || null,
      settings: settings
        ? {
            optionCount: document.querySelectorAll('[data-mobile-display-option]').length,
            normalPressed: document.querySelector('[data-mobile-display-option="normal"]')?.getAttribute('aria-pressed'),
            carePressed: document.querySelector('[data-mobile-display-option="care"]')?.getAttribute('aria-pressed'),
          }
        : null,
      bodyScrollHeight: document.body.scrollHeight,
    };
  }

  function readProjectMetrics() {
    const page = document.querySelector('[data-mobile-projects-page="true"]');
    const heading = document.querySelector('[data-mobile-projects-page="true"] h1');
    const newProjectButton = document.querySelector('[data-mobile-projects-page="true"] button[aria-label="新建项目"]');
    const firstWorkspaceIcon = document.querySelector('[data-mobile-projects-page="true"] img');
    const firstInput = document.querySelector('[data-mobile-projects-page="true"] input');
    const firstLabel = document.querySelector('[data-mobile-projects-page="true"] label');

    function box(el) {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        width: rect.width,
        height: rect.height,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: style.lineHeight,
      };
    }

    return {
      mode: document.documentElement.dataset.mobileDisplayMode || null,
      pageExists: Boolean(page),
      heading: box(heading),
      newProjectButton: box(newProjectButton),
      firstWorkspaceIcon: box(firstWorkspaceIcon),
      firstInput: box(firstInput),
      firstLabel: box(firstLabel),
      bodyScrollHeight: document.body.scrollHeight,
    };
  }

  await stubBackendApi();
  await page.waitForSelector('[data-mobile-app-nav="true"]', { timeout: 10000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate((key) => window.localStorage.removeItem(key), storageKey);
  await page.reload();
  await page.waitForSelector('[data-mobile-app-nav="true"]', { timeout: 10000 });
  await waitForMode('normal');
  const normal = await page.evaluate(readMetrics);

  const currentUrl = page.url();
  const origin = currentUrl.split('/').slice(0, 3).join('/');
  await page.goto(origin + '/?mobileTab=me');
  await page.waitForSelector('[data-mobile-display-settings="true"]', { timeout: 10000 });
  await waitForMode('normal');
  const meNormal = await page.evaluate(readMetrics);

  await page.click('[data-mobile-display-option="care"]');
  await waitForMode('care');
  const care = await page.evaluate(readMetrics);

  await page.click('[data-mobile-display-option="normal"]');
  await waitForMode('normal');
  const restoredNormal = await page.evaluate(readMetrics);

  await page.evaluate((key) => window.localStorage.setItem(key, 'normal'), storageKey);
  await page.goto(origin + '/projects');
  await page.waitForSelector('[data-mobile-projects-page="true"]', { timeout: 10000 });
  await waitForMode('normal');
  const projectsNormal = await page.evaluate(readProjectMetrics);

  await page.evaluate((key) => window.localStorage.setItem(key, 'care'), storageKey);
  await page.reload();
  await page.waitForSelector('[data-mobile-projects-page="true"]', { timeout: 10000 });
  await waitForMode('care');
  const projectsCare = await page.evaluate(readProjectMetrics);

  await page.evaluate((key) => window.localStorage.setItem(key, 'normal'), storageKey);
  await page.goto(origin + '/upload?mode=coze');
  await page.waitForSelector('main', { timeout: 10000 });
  const uploadCozeOnly = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      titleVisible: text.includes('跨次元召唤'),
      hasFolderTab: text.includes('上传文件夹'),
      hasZipTab: text.includes('上传 zip'),
      hasFilePicker: text.includes('点击选择文件夹') || text.includes('点击选择 zip'),
      hasCozeControls: text.includes('搜索 Coze Agent') || text.includes('COZE_API_TOKEN'),
    };
  });

  await page.goto(origin + '/architectures/create');
  await page.waitForSelector('.react-flow', { timeout: 15000 });
  const createMobileBeforePanel = await page.evaluate(() => {
    const text = document.body.innerText;
    const home = [...document.querySelectorAll('a')].find((link) => link.textContent?.includes('Home'));
    const title = [...document.querySelectorAll('h1')].find((heading) => heading.textContent?.includes('创建团队'));
    const nodePanelButton = [...document.querySelectorAll('button')].find((button) => {
      const label = button.textContent || '';
      return label.includes('节点列表') || label.includes('编辑节点');
    });
    const homeBox = home?.getBoundingClientRect();
    const titleBox = title?.getBoundingClientRect();

    return {
      hasCreateTitle: text.includes('创建团队'),
      hasNodePanelButton: Boolean(nodePanelButton),
      hasHoverHint: text.includes('悬停连线出现'),
      homeAndTitleAligned: Boolean(homeBox && titleBox && Math.abs((homeBox.top + homeBox.height / 2) - (titleBox.top + titleBox.height / 2)) <= 24),
    };
  });
  await page.click('button:has-text("节点列表")');
  const createMobileAfterPanel = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      panelOpen: text.includes('点击节点进行编辑') || text.includes('节点列表'),
    };
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  const desktop = await page.evaluate(() => {
    const nav = document.querySelector('[data-mobile-app-nav="true"]');
    const style = nav ? getComputedStyle(nav) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      mobileNavDisplay: style?.display || null,
    };
  });

  return JSON.stringify({ normal, meNormal, care, restoredNormal, projectsNormal, projectsCare, uploadCozeOnly, createMobileBeforePanel, createMobileAfterPanel, desktop }, null, 2);
}`
);

try {
  runCli(['close'], true);
  runCli(['open', url]);
  runCli(['resize', '390', '844']);
  const metrics = parseRunCodeJson(runCli(['run-code', '--filename', probeFile]));
  const errors = parseConsoleCounts(runCli(['console', 'error']));
  const warnings = parseConsoleCounts(runCli(['console', 'warning']));

  assert(errors.errors === 0, `Expected 0 browser console errors, got ${errors.errors}`);
  assert(warnings.warnings === 0, `Expected 0 browser console warnings, got ${warnings.warnings}`);
  assert(metrics.normal.mode === 'normal', `Expected default mobile mode normal, got ${metrics.normal.mode}`);
  assert(metrics.normal.viewport.width === 390, `Expected mobile viewport width 390, got ${metrics.normal.viewport.width}`);
  assert(metrics.normal.viewport.height === 844, `Expected mobile viewport height 844, got ${metrics.normal.viewport.height}`);
  assert(metrics.normal.nav?.height >= 62 && metrics.normal.nav.height <= 76, `Expected normal nav height around 62-76, got ${metrics.normal.nav?.height}`);
  assert(metrics.normal.iconSizes.length === 5, `Expected 5 normal mobile nav icons, got ${metrics.normal.iconSizes.length}`);
  assert(metrics.normal.labelSizes.length === 5, `Expected 5 normal mobile nav labels, got ${metrics.normal.labelSizes.length}`);

  for (const [index, icon] of metrics.normal.iconSizes.entries()) {
    assert(icon.width >= 26 && icon.width <= 34 && icon.height >= 26 && icon.height <= 34, `Normal mobile nav icon ${index} has unexpected size: ${icon.width}x${icon.height}`);
  }

  for (const label of metrics.normal.labelSizes) {
    assert(label.visible, `Normal mobile nav label is clipped: ${label.text}`);
    assert(label.fontSize >= 10 && label.fontSize <= 14, `Normal mobile nav label should be compact: ${label.text} ${label.fontSize}px`);
  }

  assert(metrics.meNormal.settings?.optionCount === 2, `Expected 2 display mode options, got ${metrics.meNormal.settings?.optionCount}`);
  assert(metrics.meNormal.settings?.normalPressed === 'true', 'Normal display option should be active by default.');
  assert(metrics.meNormal.settings?.carePressed === 'false', 'Care display option should be inactive by default.');

  assert(metrics.care.mode === 'care', `Expected care mobile mode after clicking care, got ${metrics.care.mode}`);
  assert(metrics.care.settings?.carePressed === 'true', 'Care display option should be active after click.');
  assert(metrics.care.nav?.height >= 104, `Expected care nav height >= 104, got ${metrics.care.nav?.height}`);
  for (const [index, icon] of metrics.care.iconSizes.entries()) {
    assert(icon.width >= 48 && icon.height >= 48, `Care mobile nav icon ${index} is too small: ${icon.width}x${icon.height}`);
  }

  for (const label of metrics.care.labelSizes) {
    assert(label.visible, `Care mobile nav label is clipped: ${label.text}`);
    assert(label.fontSize >= 20, `Care mobile nav label is too small: ${label.text} ${label.fontSize}px`);
  }

  assert(metrics.restoredNormal.mode === 'normal', `Expected normal mode after clicking normal, got ${metrics.restoredNormal.mode}`);
  assert(metrics.restoredNormal.settings?.normalPressed === 'true', 'Normal display option should be active after restoring normal mode.');

  assert(metrics.projectsNormal.pageExists, 'Projects page mobile layout hook is missing.');
  assert(metrics.projectsNormal.mode === 'normal', `Expected projects page normal mode, got ${metrics.projectsNormal.mode}`);
  assert(metrics.projectsNormal.heading?.fontSize >= 24 && metrics.projectsNormal.heading.fontSize <= 30, `Normal projects heading should be compact, got ${metrics.projectsNormal.heading?.fontSize}px`);
  assert(metrics.projectsNormal.newProjectButton?.width >= 44 && metrics.projectsNormal.newProjectButton.width <= 56, `Normal projects new button width should be compact, got ${metrics.projectsNormal.newProjectButton?.width}px`);
  assert(metrics.projectsNormal.newProjectButton?.height >= 44 && metrics.projectsNormal.newProjectButton.height <= 56, `Normal projects new button height should be compact, got ${metrics.projectsNormal.newProjectButton?.height}px`);
  assert(metrics.projectsNormal.firstWorkspaceIcon?.width >= 44 && metrics.projectsNormal.firstWorkspaceIcon.width <= 56, `Normal projects icon width should be compact, got ${metrics.projectsNormal.firstWorkspaceIcon?.width}px`);
  if (metrics.projectsNormal.firstLabel) {
    assert(metrics.projectsNormal.firstLabel.fontSize >= 14 && metrics.projectsNormal.firstLabel.fontSize <= 17, `Normal projects form labels should be compact, got ${metrics.projectsNormal.firstLabel.fontSize}px`);
  }
  if (metrics.projectsNormal.firstInput) {
    assert(metrics.projectsNormal.firstInput.height >= 44 && metrics.projectsNormal.firstInput.height <= 52, `Normal projects inputs should be compact, got ${metrics.projectsNormal.firstInput.height}px`);
  }

  assert(metrics.projectsCare.pageExists, 'Projects page care layout hook is missing.');
  assert(metrics.projectsCare.mode === 'care', `Expected projects page care mode, got ${metrics.projectsCare.mode}`);
  assert(metrics.projectsCare.heading?.fontSize >= 44, `Care projects heading should stay large, got ${metrics.projectsCare.heading?.fontSize}px`);
  assert(metrics.projectsCare.newProjectButton?.width >= 70, `Care projects new button should stay large, got ${metrics.projectsCare.newProjectButton?.width}px`);
  assert(metrics.projectsCare.firstWorkspaceIcon?.width >= 64, `Care projects icon should stay large, got ${metrics.projectsCare.firstWorkspaceIcon?.width}px`);
  if (metrics.projectsCare.firstInput) {
    assert(metrics.projectsCare.firstInput.height >= 52, `Care projects inputs should stay large, got ${metrics.projectsCare.firstInput.height}px`);
  }

  assert(metrics.uploadCozeOnly.titleVisible, 'Coze-only upload entry should show the cross-dimensional summon title.');
  assert(!metrics.uploadCozeOnly.hasFolderTab, 'Coze-only upload entry must not show the folder upload tab.');
  assert(!metrics.uploadCozeOnly.hasZipTab, 'Coze-only upload entry must not show the zip upload tab.');
  assert(!metrics.uploadCozeOnly.hasFilePicker, 'Coze-only upload entry must not show file picker content.');
  assert(metrics.uploadCozeOnly.hasCozeControls, 'Coze-only upload entry should render Coze summon controls.');

  assert(metrics.createMobileBeforePanel.hasCreateTitle, 'Create-team mobile page should render the title.');
  assert(metrics.createMobileBeforePanel.hasNodePanelButton, 'Create-team mobile page should expose a node panel button.');
  assert(!metrics.createMobileBeforePanel.hasHoverHint, 'Create-team mobile page should not show the hover-to-delete hint.');
  assert(metrics.createMobileBeforePanel.homeAndTitleAligned, 'Create-team mobile title should align with the Home button.');
  assert(metrics.createMobileAfterPanel.panelOpen, 'Create-team mobile node panel should open after tapping the node list button.');

  assert(metrics.desktop.mobileNavDisplay === 'none', `Mobile nav must be hidden on desktop, got display=${metrics.desktop.mobileNavDisplay}`);

  console.log(JSON.stringify({
    mobileRenderVerified: true,
    url,
    defaultMode: metrics.normal.mode,
    normalNavHeight: metrics.normal.nav.height,
    careNavHeight: metrics.care.nav.height,
    iconCount: metrics.normal.iconSizes.length,
    labelCount: metrics.normal.labelSizes.length,
    normalLabelFontSize: Math.min(...metrics.normal.labelSizes.map((label) => label.fontSize)),
    careLabelFontSize: Math.min(...metrics.care.labelSizes.map((label) => label.fontSize)),
    projectsNormalHeadingFontSize: metrics.projectsNormal.heading.fontSize,
    projectsNormalIconWidth: metrics.projectsNormal.firstWorkspaceIcon.width,
    projectsCareHeadingFontSize: metrics.projectsCare.heading.fontSize,
    projectsCareIconWidth: metrics.projectsCare.firstWorkspaceIcon.width,
    cozeOnlyUploadVerified: metrics.uploadCozeOnly,
    createTeamMobileVerified: metrics.createMobileBeforePanel,
    displayModeSwitchVerified: true,
    consoleErrors: errors.errors,
    consoleWarnings: warnings.warnings,
    desktopMobileNavDisplay: metrics.desktop.mobileNavDisplay,
  }, null, 2));
} finally {
  runCli(['close'], true);
  fs.rmSync(probeFile, { force: true });
}
