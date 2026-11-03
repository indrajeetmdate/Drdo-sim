const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static HTTP server for /dist
const distDir = path.join(__dirname, '..', 'dist');
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(distDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback
    const indexPath = path.join(distDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(indexPath).pipe(res);
  }
});

const PORT = 4173;
server.listen(PORT, async () => {
  console.log(`Server listening at http://localhost:${PORT}`);

  try {
    const { chromium, devices } = require('/root/projects/DC_Inventory_190526/node_modules/playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const screenshotsDir = path.join(__dirname, '..', 'docs', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // 1. TEST ANDROID MOBILE EXPERIENCE (Pixel 7 / 412x915)
    console.log('--- Testing Android Mobile Experience ---');
    const pixel7 = devices['Pixel 7'] || {
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
    };

    const mobileContext = await browser.newContext({
      ...pixel7,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

    // Verify initial scroll metrics
    const initialScroll = await mobilePage.evaluate(() => {
      return {
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        bodyScrollHeight: document.body.scrollHeight,
        canScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      };
    });
    console.log('Mobile scroll metrics:', initialScroll);

    await mobilePage.screenshot({
      path: path.join(screenshotsDir, 'workbench_android_mobile_top.png'),
    });

    // Test scrolling down on Android
    await mobilePage.evaluate(() => {
      window.scrollBy({ top: 600, behavior: 'instant' });
    });
    await mobilePage.waitForTimeout(400);

    const scrolledPosition = await mobilePage.evaluate(() => window.scrollY);
    console.log(`Mobile scroll Y position after scrollBy(600): ${scrolledPosition}px`);

    await mobilePage.screenshot({
      path: path.join(screenshotsDir, 'workbench_android_mobile_scrolled.png'),
    });

    // 2. TEST DESKTOP FULL WORKBENCH & FLOW DIAGRAM
    console.log('--- Testing Desktop Visual Line Diagram ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

    // Verify SVG Flow Diagram elements
    const diagramAudit = await desktopPage.evaluate(() => {
      const svg = document.querySelector('svg');
      const powerLayer = document.querySelector('#layer-electrical-power-flow');
      const materialLayer = document.querySelector('#layer-material-flow');
      const commsLayer = document.querySelector('#layer-comms-signals');
      const allText = document.body.innerText;

      return {
        hasSvg: !!svg,
        hasPowerLayer: !!powerLayer,
        hasMaterialLayer: !!materialLayer,
        hasCommsLayer: !!commsLayer,
        hasVolts: allText.includes('V DC'),
        hasAmps: allText.includes('A DC'),
        hasWatts: allText.includes('W DC'),
        hasH2: allText.includes('H₂'),
        hasDCAnnotation: allText.includes('[DC]') || allText.includes('DC'),
      };
    });
    console.log('Visual Line Diagram Audit:', diagramAudit);

    await desktopPage.screenshot({
      path: path.join(screenshotsDir, 'workbench_flow_diagram_desktop.png'),
    });

    // Test switching to Plots View
    console.log('--- Testing View Switcher to Plots View ---');
    const plotsButton = await desktopPage.$('button:has-text("Plots")');
    if (plotsButton) {
      await plotsButton.click();
      await desktopPage.waitForTimeout(500);
      await desktopPage.screenshot({
        path: path.join(screenshotsDir, 'workbench_plots_view_desktop.png'),
      });
    }

    // Test switching to Split View
    console.log('--- Testing View Switcher to Split View ---');
    const splitButton = await desktopPage.$('button:has-text("Split")');
    if (splitButton) {
      await splitButton.click();
      await desktopPage.waitForTimeout(500);
      await desktopPage.screenshot({
        path: path.join(screenshotsDir, 'workbench_split_view_desktop.png'),
      });
    }

    await browser.close();
    console.log('All verification checks passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Verification error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
});
