import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Listen to console events
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type()}:`, msg.text());
  });

  page.on('pageerror', error => {
    console.log(`[Browser Page Error]:`, error.message);
  });

  page.on('response', response => {
    if (response.status() === 404) {
      console.log(`[404] ${response.url()}`);
    }
  });

  console.log('Navigating to http://localhost:5175...');
  try {
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle2', timeout: 10000 });
  } catch (err) {
    console.log('Error navigating:', err.message);
  }

  console.log('Waiting for a few seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  await browser.close();
  console.log('Done.');
})();
