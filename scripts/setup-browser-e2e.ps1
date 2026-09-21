$ErrorActionPreference = "Stop"

Write-Host "Installing Playwright test runner..."
npm install --save-dev @playwright/test

Write-Host "Adding QueueDrop browser E2E scripts..."
npm pkg set "scripts.test:e2e=playwright test"
npm pkg set "scripts.test:e2e:headed=playwright test --headed"
npm pkg set "scripts.test:e2e:ui=playwright test --ui"
npm pkg set "scripts.test:e2e:report=playwright show-report"

Write-Host "Installing Chromium for Playwright..."
npx playwright install chromium

Write-Host ""
Write-Host "Browser E2E setup complete."
Write-Host "Run: npm run test:e2e"
