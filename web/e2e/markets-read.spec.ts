import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read-path E2E against live testnet RPC (no mocked chain data).
 * Requires config/networks.testnet.json from `make deploy:testnet`.
 */
function loadDemoMarket(): string | null {
  try {
    const file = join(process.cwd(), "..", "config", "networks.testnet.json");
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      fixtures?: { demoMarket?: string };
    };
    return raw.fixtures?.demoMarket ?? null;
  } catch {
    return null;
  }
}

test("markets index loads", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.getByRole("heading", { name: "Markets" })).toBeVisible();
  const body = await page.locator("main").textContent();
  const hasList =
    body?.includes("Scalar") ||
    body?.includes("Trajectory") ||
    body?.includes("No markets yet") ||
    body?.includes("Couldn't read");
  expect(hasList).toBeTruthy();
});

test("market detail reads chain state when fixture exists", async ({ page }) => {
  const demo = loadDemoMarket() ?? process.env.NEXT_PUBLIC_KAIDO_DEMO_MARKET;
  test.skip(!demo, "no demo market in config/networks.testnet.json");

  await page.goto(`/markets/${demo}`);
  await expect(page.getByRole("heading", { name: /market/i })).toBeVisible();
  await expect(page.getByText("Settlement")).toBeVisible();
  await expect(page.getByText("Consensus distribution")).toBeVisible();
  const settlement = page.locator("text=Trading open").or(page.locator("text=Trading closed"));
  await expect(settlement.first()).toBeVisible({ timeout: 30_000 });
});
