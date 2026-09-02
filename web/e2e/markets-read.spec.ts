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
  await expect(page.getByRole("heading", { name: "Markets", level: 1 })).toBeVisible();
  const body = await page.locator("main").textContent();
  const hasList =
    body?.includes("Crowd target") ||
    body?.includes("Trade range") ||
    body?.includes("No markets yet") ||
    body?.includes("Couldn't load");
  expect(hasList).toBeTruthy();
});

test("market detail reads chain state when fixture exists", async ({ page }) => {
  const demo = loadDemoMarket() ?? process.env.NEXT_PUBLIC_KAIDO_DEMO_MARKET;
  test.skip(!demo, "no demo market in config/networks.testnet.json");

  await page.goto(`/markets/${demo}`);
  await expect(page.getByText("Payoff zone")).toBeVisible();
  await expect(page.getByText("Call the number")).toBeVisible();
  const settlement = page.locator("text=Trading is open").or(page.locator("text=Place belief"));
  await expect(settlement.first()).toBeVisible({ timeout: 30_000 });
});
