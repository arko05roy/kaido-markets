import { expect, test } from "@playwright/test";

// Sprint-0 smoke: the landing page renders and the health route answers.
test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kaido" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ChartGuessr" })).toBeVisible();
});

test("health route reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(["local", "testnet", "futurenet", "mainnet"]).toContain(body.network);
});
