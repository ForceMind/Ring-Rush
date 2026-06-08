const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => {
      console.log('BROWSER ERROR:', err.toString());
      console.log('STACK:', err.stack);
  });

  console.log('Navigating to game...');
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });

  await new Promise(r => setTimeout(r, 1000));
  const canvas = await page.$('#gameCanvas');
  const box = await canvas.boundingBox();
  const scaleX = box.width / 600;
  const scaleY = box.height / 900;
  
  await page.mouse.click(box.x + 300 * scaleX, box.y + 470 * scaleY);
  await new Promise(r => setTimeout(r, 500));
  await page.mouse.click(box.x + 300 * scaleX, box.y + 725 * scaleY);
  await new Promise(r => setTimeout(r, 1000));
  
  await browser.close();
})();
