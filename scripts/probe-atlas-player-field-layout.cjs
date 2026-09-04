/* Run with the bundled Electron executable, never against an existing profile.
 * Loads only the public signed-out lobby; does not sign in or press play.
 * Compiles the diagnostic's production recovery modules in memory (no app build).
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

const repo = path.resolve(__dirname, '..');
const output = path.join(repo, 'output', 'playwright');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'riftlite-atlas-field-repair-')));

const sourceModules = new Map();
function sourceModule(relativePath) {
  relativePath = relativePath.replaceAll('\\', '/');
  if (sourceModules.has(relativePath)) return sourceModules.get(relativePath);
  const source = fs.readFileSync(path.join(repo, relativePath), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = specifier => {
    assert.ok(specifier.startsWith('.'), `Unexpected diagnostic dependency: ${specifier}`);
    const dependency = path.relative(repo, path.resolve(repo, path.dirname(relativePath), specifier)).replace(/\.js$/, '.ts');
    assert.ok(!dependency.startsWith('..'), 'Diagnostic dependencies must remain in the repository');
    return sourceModule(dependency);
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, localRequire);
  sourceModules.set(relativePath, module.exports);
  return module.exports;
}

const {
  ATLAS_LOBBY_PLAYER_FIELD_PROBE,
  atlasLobbyPlayerFieldRepairCssForUrl
} = sourceModule('src/shared/atlasLobbyPlayerField.ts');
const { AtlasGuestRecoveryLifecycle } = sourceModule('src/main/services/atlasGuestRecoveryLifecycle.ts');
const { AtlasEmptyShellMainRecoveryGuard } = sourceModule('src/main/services/atlasEmptyShellMainRecovery.ts');
const { AtlasCompatibilityStyleInstaller } = sourceModule('src/main/services/atlasCompatibilityStyleInstaller.ts');
const { atlasCardRenderingCssForUrl } = sourceModule('src/shared/atlasCardRendering.ts');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const requestedWidth = Number(process.env.RIFTLITE_ATLAS_PROBE_WIDTH || 1690);
const requestedHeight = Number(process.env.RIFTLITE_ATLAS_PROBE_HEIGHT || 945);
const requestedScale = Number(process.env.RIFTLITE_ATLAS_PROBE_SCALE || 1);
const probeWidth = Number.isFinite(requestedWidth) && requestedWidth >= 640 ? Math.round(requestedWidth) : 1690;
const probeHeight = Number.isFinite(requestedHeight) && requestedHeight >= 640 ? Math.round(requestedHeight) : 945;
const probeScale = Number.isFinite(requestedScale) && requestedScale >= 1 && requestedScale <= 3 ? requestedScale : 1;
app.commandLine.appendSwitch('force-device-scale-factor', String(probeScale));
const measurements = `(() => {
  const field = document.querySelector('#right-rail-player-name');
  const panel = field?.closest('.lobby-entry-panel');
  const layout = el => el ? ({
    tag: el.tagName,
    classes: Array.from(el.classList).slice(0, 6),
    bounds: el.getBoundingClientRect().toJSON(),
    display: getComputedStyle(el).display,
    gridArea: getComputedStyle(el).gridArea
  }) : null;
  return { viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    field: field?.getBoundingClientRect().toJSON(),
    visibility: document.visibilityState,
    panel: layout(panel),
    panelChildren: panel ? Array.from(panel.children).map(layout) : [],
    playButtons: panel ? Array.from(panel.querySelectorAll('.lobby-quick-match-actions button, .lobby-private-play-actions button, .lobby-room-code-actions button')).map(layout) : [],
    ancestors: field ? [field, ...Array.from({ length: 12 }, (_, index) => {
      let current = field;
      for (let step = 0; step <= index; step++) current = current?.parentElement;
      return current;
    })].filter(Boolean).map(el => {
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        id: el.id,
        classes: Array.from(el.classList).slice(0, 8),
        display: style.display,
        position: style.position,
        visibility: style.visibility,
        overflow: style.overflow,
        width: style.width,
        minWidth: style.minWidth,
        height: style.height,
        minHeight: style.minHeight,
        gridTemplateRows: style.gridTemplateRows,
        gridTemplateColumns: style.gridTemplateColumns,
        flex: style.flex,
        containerType: style.containerType,
        containerName: style.containerName,
        bounds: el.getBoundingClientRect().toJSON()
      };
    }) : [] };
})()`;
const deadline = setTimeout(() => { console.error('Native layout probe timed out'); app.exit(1); }, 55000);

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ width: probeWidth, height: probeHeight, useContentSize: true, show: false,
      webPreferences: { partition: 'atlas-field-repair-probe', sandbox: true,
        nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    const guest = win.webContents;
    guest.setWindowOpenHandler(() => ({ action: 'deny' }));
    const results = [];
    let applications = 0;
    let healthyApplications = 0;
    let compatibilityApplications = 0;
    let compatibilityInsertion = Promise.resolve('');
    let safe = true;
    const baseline = new AtlasCompatibilityStyleInstaller({
      isDestroyed: () => guest.isDestroyed(),
      cssForCurrentUrl: () => atlasCardRenderingCssForUrl(guest.getURL()),
      insertCss: css => {
        compatibilityApplications++;
        compatibilityInsertion = guest.insertCSS(css);
        return compatibilityInsertion;
      },
      removeCss: key => guest.removeInsertedCSS(key),
      reportFailure: error => { throw error; }
    });
    const emptyShell = new AtlasEmptyShellMainRecoveryGuard();
    const controller = new AtlasGuestRecoveryLifecycle({
      guest,
      platform: 'atlas',
      emptyShellRecovery: emptyShell,
      currentAtlasGuestId: () => guest.id,
      platformSwitchAllowed: () => safe,
      protectedByGameEntry: () => false,
      readField: () => guest.executeJavaScript(ATLAS_LOBBY_PLAYER_FIELD_PROBE),
      applyCss: async () => {
        applications++;
        await guest.insertCSS(atlasLobbyPlayerFieldRepairCssForUrl(guest.getURL()));
      },
      report: outcome => results.push(outcome)
    });
    const navigationEvents = [];
    const blockedTarget = 'https://riftatlas.com/__riftlite_probe_blocked__';
    let preventedNavigation = false;
    guest.on('will-navigate', (event, url) => {
      if (url === blockedTarget) {
        event.preventDefault();
        preventedNavigation = true;
      }
    });
    guest.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
      controller.navigationStarted(isInPlace, isMainFrame);
      if (isMainFrame && !isInPlace) {
        baseline.invalidate();
        navigationEvents.push({ phase: 'start', url });
      }
    });
    guest.on('did-navigate', (_event, url) => {
      controller.navigationCommitted(url);
      navigationEvents.push({ phase: 'commit', url });
    });
    guest.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      controller.inPageNavigationCommitted(url, isMainFrame);
    });
    guest.on('dom-ready', () => baseline.install());
    for (let documentIndex = 0; documentIndex < 2; documentIndex++) {
      await guest.loadURL('https://play.riftatlas.com/');
      await compatibilityInsertion;
      for (let attempt = 0; attempt < 40; attempt++) {
        if (await guest.executeJavaScript('Boolean(document.querySelector("#right-rail-player-name"))')) break;
        await delay(250);
      }
      await delay(1500);
      const initialFieldBounds = await guest.executeJavaScript('document.querySelector("#right-rail-player-name")?.getBoundingClientRect().toJSON()');
      const applicationsBefore = applications;
      const before = await guest.executeJavaScript(ATLAS_LOBBY_PLAYER_FIELD_PROBE);
      const beforeBounds = await guest.executeJavaScript(measurements);
      fs.writeFileSync(path.join(output, `atlas-player-field-repair-${documentIndex}-before.png`), (await guest.capturePage()).toPNG());
      // A protected guest must not be touched, even when the defect is present.
      safe = false;
      await controller.check();
      assert.equal(applications, applicationsBefore);
      safe = true;
      await controller.check();
      if (documentIndex === 0 && before === 'ready') {
        healthyApplications++;
        await guest.insertCSS(atlasLobbyPlayerFieldRepairCssForUrl(guest.getURL()));
        await delay(250);
      }
      const after = await guest.executeJavaScript(ATLAS_LOBBY_PLAYER_FIELD_PROBE);
      const afterBounds = await guest.executeJavaScript(measurements);
      const focusable = await guest.executeJavaScript(`(() => {
        const field = document.querySelector('#right-rail-player-name');
        if (!field) return false;
        field.focus({ preventScroll: true });
        return document.activeElement === field;
      })()`);
      fs.writeFileSync(path.join(output, `atlas-player-field-repair-${documentIndex}-after.png`), (await guest.capturePage()).toPNG());
      const record = { documentIndex, requestedViewport: { width: probeWidth, height: probeHeight, scale: probeScale }, viewport: beforeBounds.viewport, initialFieldBounds, before, beforeBounds, after, afterBounds, focusable, compatibilityApplications, healthyApplications, applications, results };
      console.log(JSON.stringify(process.env.RIFTLITE_ATLAS_PROBE_VERBOSE
        ? record
        : {
          ...record,
          beforeBounds: beforeBounds.field,
          beforePanel: beforeBounds.panel,
          beforePanelChildren: beforeBounds.panelChildren,
          afterBounds: afterBounds.field,
          afterPanel: afterBounds.panel,
          afterPanelChildren: afterBounds.panelChildren,
          afterPlayButtons: afterBounds.playButtons
        }));
      assert.ok(before === 'collapsed' || before === 'ready', 'Live lobby must expose the expected idle form');
      assert.equal(after, 'ready');
      assert.equal(focusable, true);
      assert.ok(applications - applicationsBefore <= 1);
      if (applications > applicationsBefore) assert.equal(results.at(-1), 'repaired');
      const applicationsAfter = applications;
      await controller.check();
      controller.inPageNavigationCommitted(guest.getURL(), true); // Same-document navigation must not reset its budget.
      await controller.check();
      assert.equal(applications, applicationsAfter);
      if (documentIndex === 0) {
        for (const zoom of [0.8, 1, 1.6]) {
          guest.setZoomFactor(zoom);
          await delay(150);
          assert.equal(await guest.executeJavaScript(ATLAS_LOBBY_PLAYER_FIELD_PROBE), 'ready');
        }
        guest.setZoomFactor(1);
        // Exercise Electron's actual prevented-navigation event order. The
        // will-navigate handler blocks this before any external page is loaded.
        const epochBeforeBlockedStart = controller.documentEpoch;
        const retainedUrl = guest.getURL();
        const compatibilityBeforeBlockedStart = compatibilityApplications;
        const countBeforeBlockedStart = navigationEvents.length;
        await guest.executeJavaScript(`location.assign(${JSON.stringify(blockedTarget)}); undefined;`);
        await delay(250);
        assert.equal(preventedNavigation, true);
        assert.equal(guest.getURL(), retainedUrl);
        assert.equal(controller.isCurrentDocument(), true);
        assert.equal(emptyShell.isCurrentNavigation(guest.id, retainedUrl), true);
        assert.equal(compatibilityApplications, compatibilityBeforeBlockedStart);
        const blockedEvents = navigationEvents.slice(countBeforeBlockedStart);
        const blockedStartObserved = blockedEvents.some(event => event.phase === 'start' && event.url === blockedTarget);
        // Some Electron versions prevent will-navigate before emitting start.
        // Record that distinction; the executable unit suite covers the start
        // cancellation contract even when this native ordering skips it.
        if (blockedStartObserved) assert.equal(controller.isCurrentDocument(epochBeforeBlockedStart), false);
        assert.equal(blockedEvents.some(event => event.phase === 'commit'), false);
        const pendingReload = emptyShell.considerEmptyShell(guest.id, retainedUrl, false);
        assert.equal(pendingReload.action, 'schedule-reload');
        emptyShell.abandonScheduledReload(pendingReload.recoveryKey);
        await controller.check();
        assert.equal(applications, applicationsAfter);
        console.log(JSON.stringify({ preventedNavigation, blockedStartObserved, blockedEvents, committedLobbyRetained: true }));
      }
    }
    controller.dispose();
    baseline.dispose();
    console.log(`PASS: native production-adapter check at ${probeWidth}x${probeHeight} DPR${probeScale}, preinstalled compatibility CSS, healthy-layout safety, protected guest, duplicate/SPA budget, prevented navigation, same-URL reload, focus and zoom. Dedicated CSS repairs: ${applications}`);
    clearTimeout(deadline);
    win.destroy();
    app.quit();
  } catch (error) {
    console.error(error.stack || String(error));
    clearTimeout(deadline);
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(1);
  }
});
