const { chromium } = require('/root/projects/DC_Inventory_190526/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

async function testNumerical() {
  const distDir = path.resolve(__dirname, '../dist');
  const server = http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve) => server.listen(4181, resolve));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:4181');
  await page.waitForTimeout(1000);

  // Switch to 1:10 Benchtop scale
  await page.click('button:has-text("1:10 Benchtop")');
  await page.waitForTimeout(1000);

  const text = await page.innerText('body');
  
  // Extract key KPI numbers from the page
  console.log('--- 1:10 Scale KPI Summary Check ---');
  const h2ProdMatch = text.match(/([0-9.]+) kg H₂/g);
  console.log('H2 Matches found on page:', h2ProdMatch);

  // Verify KCL Residual
  const kclMatch = text.match(/KCL Residual:\s*([0-9.A-Za-z ()]+)/);
  if (kclMatch) {
    console.log('KCL Residual status:', kclMatch[0]);
  }

  // Verify First Law Balance
  const firstLawMatch = text.match(/PASS|Residual: [0-9.e-]+ kWh/g);
  console.log('First Law status:', firstLawMatch);

  await browser.close();
  server.close();
}

testNumerical().catch(console.error);
