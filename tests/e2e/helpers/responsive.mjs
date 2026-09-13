import { expect } from "@playwright/test";

export const responsiveViewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
];

export async function expectResponsivePage(page, label = "page") {
  await expect(page.locator("body"), `${label} body should render`).toBeVisible();
  await expect(page.locator("body"), `${label} should not show an app error`).not.toContainText(
    /Internal Server Error|Application error/i,
  );

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const documentWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);

    const visibleOverflowing = [...document.querySelectorAll("button, a, input, select, textarea")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (element.closest("details:not([open])")) return false;
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        if (rect.width <= 0 || rect.height <= 0) return false;
        // Ignore controls intentionally positioned off-canvas (for example the closed mobile sidebar).
        if (rect.right <= 0 || rect.left >= viewportWidth) return false;
        return rect.left < -2 || rect.right > viewportWidth + 2;
      })
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName,
        text: (element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 80),
        rect: element.getBoundingClientRect().toJSON(),
      }));

    return {
      viewportWidth,
      documentWidth,
      overflow: documentWidth - viewportWidth,
      visibleOverflowing,
    };
  });

  expect(metrics.overflow, `${label} should not horizontally overflow the document`).toBeLessThanOrEqual(2);
  expect(metrics.visibleOverflowing, `${label} has visible controls clipped outside the viewport`).toEqual([]);
}
