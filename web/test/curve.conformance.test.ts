/**
 * Shared conformance: `web/lib/curve` must reproduce `kaido-math` byte-for-byte
 * (within each vector's `tol_abs`) on the `docs/test-vectors/*.json` set. The
 * Rust side runs the same vectors; a mismatch fails CI on both (ADR-8,
 * build.md §6 item 5). Regenerate vectors: `python3 docs/test-vectors/generate.py`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  expWad,
  gaussianL2Norm,
  lambda,
  gaussianPdfScaled,
  sigmaFloor,
} from "@/lib/curve";

const vectorsDir = join(__dirname, "..", "..", "docs", "test-vectors");
const load = (f: string) => JSON.parse(readFileSync(join(vectorsDir, f), "utf8"));

function expectWithin(actual: bigint, expected: bigint, tol: bigint, note: string) {
  const diff = actual > expected ? actual - expected : expected - actual;
  expect(diff <= tol, `${note}: got ${actual}, expected ${expected} (±${tol})`).toBe(true);
}

describe("curve ↔ kaido-math conformance", () => {
  it("exp_wad", () => {
    for (const v of load("exp.json").vectors as Array<Record<string, string>>) {
      expectWithin(expWad(BigInt(v.x_wad)), BigInt(v.expected_wad), BigInt(v.tol_abs), `exp ${v.note}`);
    }
  });

  it("gaussian_l2_norm / lambda / pdf_scaled / sigma_floor", () => {
    const g = load("gaussian.json");
    for (const v of g.l2_norm as Array<Record<string, string>>) {
      expectWithin(gaussianL2Norm(BigInt(v.sigma_wad)), BigInt(v.expected_wad), BigInt(v.tol_abs), `l2 ${v.note}`);
    }
    for (const v of g.lambda as Array<Record<string, string>>) {
      expectWithin(lambda(BigInt(v.k_wad), BigInt(v.sigma_wad)), BigInt(v.expected_wad), BigInt(v.tol_abs), `lambda ${v.note}`);
    }
    for (const v of g.pdf_scaled as Array<Record<string, string>>) {
      expectWithin(
        gaussianPdfScaled(BigInt(v.mu_wad), BigInt(v.sigma_wad), BigInt(v.lambda_wad), BigInt(v.x_wad)),
        BigInt(v.expected_wad),
        BigInt(v.tol_abs),
        `pdf ${v.note}`,
      );
    }
    for (const v of g.sigma_floor as Array<Record<string, string>>) {
      expectWithin(sigmaFloor(BigInt(v.k_wad), BigInt(v.b_wad)), BigInt(v.expected_wad), BigInt(v.tol_abs), `sigma_floor ${v.note}`);
    }
  });
});
