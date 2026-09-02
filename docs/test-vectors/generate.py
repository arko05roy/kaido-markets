#!/usr/bin/env python3
"""Generate the cross-language conformance vectors for Kaido's fixed-point math.

The output JSON files in this directory are the *single source of truth* for the
Gaussian / curve math (ADR-1, ADR-8). They are consumed by:
  * `contracts/crates/kaido-math` (Rust)        — Sprint 1
  * `web/lib/curve` / `packages/sdk`  (TypeScript) — Sprint 3

Run:  python3 docs/test-vectors/generate.py    (requires `pip install mpmath`)

Conventions (must match `kaido_math::fp` exactly):
  * WAD = 10**18. A fixed-point value `v` represents the real number `v / WAD`.
  * `to_wad(real)` = round-half-away-from-zero(real * WAD)  — the *ideal*
    answer; an implementation may differ by up to `tol_abs` (which bundles the
    algorithm's ≤1e-9 relative error plus accumulated truncation).
  * Money is 7-dp at the contract boundary but every number *in these vectors*
    is already WAD-scaled — the boundary conversion is the contract's job, not
    the math crate's.

Every reference value is computed at 60 decimal digits of precision with mpmath.
"""

import json
import os
import sys

try:
    import mpmath as mp
except ModuleNotFoundError:  # pragma: no cover
    sys.exit("this generator needs mpmath: `pip install mpmath`")

mp.mp.dps = 60

WAD = 10**18
HERE = os.path.dirname(os.path.abspath(__file__))

# How accurate `kaido_math` promises to be (ADR-1): ≤ 1e-9 relative for the
# polynomial functions, plus a few ulps of truncation slack. The conformance
# test in Rust (and later TS) asserts |got - expected| <= tol_abs.
REL_TOL_POLY = mp.mpf("1e-9")


def to_wad(x) -> int:
    """round-half-away-from-zero(x * WAD), as a Python int."""
    x = mp.mpf(x) * WAD
    if x >= 0:
        return int(mp.floor(x + mp.mpf("0.5")))
    return -int(mp.floor(-x + mp.mpf("0.5")))


def from_wad(n: int):
    return mp.mpf(int(n)) / WAD


def tol_poly(expected_wad: int, *, min_ulps: int = 4) -> int:
    """Absolute tolerance for a ≤1e-9-relative polynomial result, in wad units."""
    rel = int(mp.ceil(abs(expected_wad) * REL_TOL_POLY))
    return max(rel, min_ulps)


def tol_pdf(expected_wad: int, peak_real) -> int:
    """Tolerance for `gaussian_pdf_scaled`.

    The implementation is `peak · exp_wad(−z²/2) / WAD`. In the deep tail
    `exp_wad` returns a small integer whose ±1-WAD-ULP error multiplies by
    `peak` — so the absolute error of the result is `≈ ceil(peak_real) ULPs`,
    which dwarfs the 1e-9-relative bound exactly when the value is tiny. (For a
    real market the σ-floor caps `peak ≤ b`, so this slack is `≲ b ULPs` — a
    sub-femto-dollar absolute error; it only ever bites artificial deep-tail
    probe vectors like this one.)"""
    return max(tol_poly(expected_wad, min_ulps=8), int(mp.ceil(mp.mpf(peak_real))) + 8)


def write(name: str, payload: dict) -> None:
    path = os.path.join(HERE, name)
    payload = {
        "_generated_by": "docs/test-vectors/generate.py",
        "_wad": str(WAD),
        **payload,
    }
    with open(path, "w") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")
    print(f"wrote {name}: {sum(len(v) for v in payload.values() if isinstance(v, list))} vectors")


# --------------------------------------------------------------------------- #
# exp_wad
# --------------------------------------------------------------------------- #
def gen_exp():
    # Domain `kaido_math::exp_wad` supports: [-MAX_EXP_ARG, MAX_EXP_ARG] with
    # MAX_EXP_ARG = 46 (the largest argument whose WAD-scaled result fits i128).
    # Below ≈ -41.45 the WAD result rounds to 0 and exp_wad returns 0 exactly.
    xs = [
        "0", "1", "-1", "0.5", "-0.5",
        "0.34657359027997264311",   # +ln2/2 (range-reduction boundary)
        "-0.34657359027997264311",  # -ln2/2
        "0.6931471805599453",       # ln2
        "-0.6931471805599453",
        "0.69314718055994530942",
        "2", "-2", "5", "-5", "10", "-10", "20", "-20",
        "0.0001", "-0.0001", "1e-9", "-1e-9", "1e-12",
        "30", "-30", "40", "-40", "44", "45", "46",
        "-41", "-41.4", "-41.44", "-41.45",  # straddle the underflow cliff
        "-42", "-43", "-45", "-46",
        "3.14159265358979323846", "-3.14159265358979323846",
        "12.5", "-12.5", "7.7", "-7.7", "0.123456789", "-0.987654321",
    ]
    vectors = []
    for s in xs:
        x = mp.mpf(s)
        val = mp.e ** x
        exp_wad = to_wad(val)
        # 0 if the true value rounds below half a wad-unit.
        vectors.append({
            "x_wad": str(to_wad(s)),
            "expected_wad": str(exp_wad),
            "tol_abs": str(tol_poly(exp_wad)),
            "note": s,
        })
    write("exp.json", {"fn": "exp_wad", "domain": "x in [-46,46] WAD; 0 for x<~-41.45", "vectors": vectors})


# --------------------------------------------------------------------------- #
# erf_wad / erfc_wad
# --------------------------------------------------------------------------- #
def gen_erf():
    xs = [
        "0", "0.1", "-0.1", "0.5", "-0.5", "1", "-1", "1.5", "-1.5",
        "2", "-2", "2.0001", "-2.0001",  # straddle the series↔CF switch at |x|=2
        "2.5", "-2.5", "3", "-3", "4", "-4", "5", "-5", "5.9", "6", "6.1",
        "-6", "-7", "7",
        "0.01", "-0.01", "1e-6", "-1e-6",
        "0.7071067811865476", "-0.7071067811865476",  # 1/√2
        "1.4142135623730951", "-1.4142135623730951",  # √2
        "0.8472130847939792",  # erf(x) ≈ 0.77 territory
        "0.3", "-0.3", "1.2", "-1.2", "3.5", "-3.5",
    ]
    erf_v, erfc_v = [], []
    for s in xs:
        x = mp.mpf(s)
        e = mp.erf(x)
        ec = mp.erfc(x)
        e_wad, ec_wad = to_wad(e), to_wad(ec)
        x_wad = str(to_wad(s))
        erf_v.append({"x_wad": x_wad, "expected_wad": str(e_wad), "tol_abs": str(tol_poly(e_wad, min_ulps=8)), "note": s})
        erfc_v.append({"x_wad": x_wad, "expected_wad": str(ec_wad), "tol_abs": str(tol_poly(ec_wad, min_ulps=8)), "note": s})
    write("erf.json", {"fn": ["erf_wad", "erfc_wad"], "domain": "x in [-7,7] WAD; saturates to ±WAD / 0,2WAD beyond |x|≈6",
                       "erf": erf_v, "erfc": erfc_v})


# --------------------------------------------------------------------------- #
# gaussian: l2_norm(σ), lambda(k,σ), pdf_scaled(μ,σ,λ,x), sigma_floor(k,b)
# --------------------------------------------------------------------------- #
SQRT_PI = mp.sqrt(mp.pi)
SQRT_2PI = mp.sqrt(2 * mp.pi)


def g_l2_norm(sigma):
    # ‖φ_{μ,σ}‖₂ = √( 1 / (2σ√π) )   (whitepaper §11; independent of μ)
    return mp.sqrt(1 / (2 * sigma * SQRT_PI))


def g_lambda(k, sigma):
    # λ = k·√(2σ√π)  ⇒  ‖λ·φ‖₂ = k
    return k * mp.sqrt(2 * sigma * SQRT_PI)


def g_pdf_scaled(mu, sigma, lam, x):
    # λ · φ_{μ,σ}(x) = (λ / (σ√(2π))) · exp(-(x-μ)²/(2σ²))
    z = (x - mu) / sigma
    return (lam / (sigma * SQRT_2PI)) * mp.e ** (-(z * z) / 2)


def g_sigma_floor(k, b):
    # σ_min = k² / (b²·√π)   (peak of λ·φ at μ ≤ b)   (whitepaper §10 option 1)
    return (k * k) / (b * b * SQRT_PI)


def gen_gaussian():
    # Realistic-ish numbers: outcome = a price in USD, σ in USD, k a depth
    # constant in USD·√USD, b the per-outcome collateral in USD. The math is
    # unit-agnostic; these just exercise a wide dynamic range.
    sigmas = ["0.01", "0.1", "1", "2.5", "10", "100", "500", "1000", "1e4", "1e6", "0.001", "3.7", "42"]
    ks = ["1", "10", "100", "1000", "31.62277660168379332", "0.5", "7777"]
    bs = ["1", "10", "100", "1000", "1e4", "1e5", "12345"]

    l2 = []
    for s in sigmas:
        sig = mp.mpf(s)
        v = g_l2_norm(sig)
        w = to_wad(v)
        l2.append({"sigma_wad": str(to_wad(s)), "expected_wad": str(w), "tol_abs": str(tol_poly(w)), "note": s})

    lam = []
    for ks_ in ks:
        for s in sigmas:
            k = mp.mpf(ks_); sig = mp.mpf(s)
            v = g_lambda(k, sig)
            if v * WAD > mp.mpf(2) ** 126:   # keep within the i128 wad envelope
                continue
            w = to_wad(v)
            lam.append({"k_wad": str(to_wad(ks_)), "sigma_wad": str(to_wad(s)),
                        "expected_wad": str(w), "tol_abs": str(tol_poly(w)), "note": f"k={ks_},sigma={s}"})

    pdf = []
    # Use λ consistent with (k, σ) for k=100, plus a couple of bare-λ rows.
    K = mp.mpf("100")
    for s in ["0.1", "1", "10", "100", "500"]:
        sig = mp.mpf(s)
        L = g_lambda(K, sig)
        peak = L / (sig * SQRT_2PI)
        mu = mp.mpf("0")
        for zmul in ["0", "0.5", "1", "2", "3", "5", "8", "-1", "-2.5", "-6"]:
            x = mu + mp.mpf(zmul) * sig
            v = g_pdf_scaled(mu, sig, L, x)
            w = to_wad(v)
            pdf.append({"mu_wad": str(to_wad(mu)), "sigma_wad": str(to_wad(s)), "lambda_wad": str(to_wad(L)),
                        "x_wad": str(to_wad(x)), "expected_wad": str(w), "tol_abs": str(tol_pdf(w, peak)),
                        "note": f"k=100,sigma={s},z={zmul}"})
    # Shifted mean + arbitrary λ.
    for (mu_, sig_, lam_, x_) in [("50", "10", "250", "55"), ("-3.2", "1.5", "9.9", "0"),
                                  ("1000", "200", "5000", "1300"), ("0", "1", "1", "0")]:
        sig_m, lam_m = mp.mpf(sig_), mp.mpf(lam_)
        peak = lam_m / (sig_m * SQRT_2PI)
        v = g_pdf_scaled(mp.mpf(mu_), sig_m, lam_m, mp.mpf(x_))
        w = to_wad(v)
        pdf.append({"mu_wad": str(to_wad(mu_)), "sigma_wad": str(to_wad(sig_)), "lambda_wad": str(to_wad(lam_)),
                    "x_wad": str(to_wad(x_)), "expected_wad": str(w), "tol_abs": str(tol_pdf(w, peak)),
                    "note": f"mu={mu_},sigma={sig_},lambda={lam_},x={x_}"})

    floor = []
    for ks_ in ks:
        for bs_ in bs:
            k = mp.mpf(ks_); b = mp.mpf(bs_)
            v = g_sigma_floor(k, b)
            if v * WAD > mp.mpf(2) ** 126 or v * WAD < mp.mpf("0.5"):
                continue
            w = to_wad(v)
            floor.append({"k_wad": str(to_wad(ks_)), "b_wad": str(to_wad(bs_)),
                          "expected_wad": str(w), "tol_abs": str(tol_poly(w)), "note": f"k={ks_},b={bs_}"})

    write("gaussian.json", {
        "fns": ["gaussian_l2_norm(sigma)", "lambda(k,sigma)", "gaussian_pdf_scaled(mu,sigma,lambda,x)", "sigma_floor(k,b)"],
        "l2_norm": l2, "lambda": lam, "pdf_scaled": pdf, "sigma_floor": floor,
    })


# --------------------------------------------------------------------------- #
# worst_case_collateral(g, f) = max(0, -min_x (g(x) - f(x)))
# --------------------------------------------------------------------------- #
def worst_case(gp, fp):
    mu_g, sig_g, lam_g = gp
    mu_f, sig_f, lam_f = fp

    def d(x):
        return g_pdf_scaled(mu_g, sig_g, lam_g, x) - g_pdf_scaled(mu_f, sig_f, lam_f, x)

    # Bracket: both bells are < 1e-40 of their peak beyond ~13σ; min(g-f) over ℝ
    # equals min(0, interior min) since d→0 at ±∞.
    sig_max = max(sig_g, sig_f)
    lo = min(mu_g, mu_f) - 14 * sig_max
    hi = max(mu_g, mu_f) + 14 * sig_max
    # Dense scan stepped by the *narrower* σ so we never step over a thin dip,
    # then golden-section refine around the lowest sample.
    sig_min = min(sig_g, sig_f)
    n = int(mp.ceil((hi - lo) / (sig_min / 64))) + 1
    n = min(n, 200000)
    step = (hi - lo) / (n - 1)
    best_x, best_v = lo, d(lo)
    x = lo
    for _ in range(1, n):
        x = x + step
        v = d(x)
        if v < best_v:
            best_v, best_x = v, x
    # golden-section in [best_x - step, best_x + step]
    a, b = best_x - step, best_x + step
    gr = (mp.sqrt(5) - 1) / 2
    c = b - gr * (b - a)
    e = a + gr * (b - a)
    fc, fe = d(c), d(e)
    for _ in range(200):
        if fc < fe:
            b, e, fe = e, c, fc
            c = b - gr * (b - a)
            fc = d(c)
        else:
            a, c, fc = c, e, fe
            e = a + gr * (b - a)
            fe = d(e)
        if b - a < mp.mpf("1e-40"):
            break
    interior_min = min(fc, fe, best_v)
    return max(mp.mpf(0), -interior_min)


def gen_worst_case():
    K = mp.mpf("100")

    def lam_of(sig):
        return g_lambda(K, sig)

    cases = []
    # (label, gp, fp) — gp/fp are (mu, sigma, lambda)
    def add(label, mu_g, sig_g, mu_f, sig_f, *, lam_g=None, lam_f=None):
        sig_g, sig_f = mp.mpf(sig_g), mp.mpf(sig_f)
        gp = (mp.mpf(mu_g), sig_g, lam_g if lam_g is not None else lam_of(sig_g))
        fp = (mp.mpf(mu_f), sig_f, lam_f if lam_f is not None else lam_of(sig_f))
        v = worst_case(gp, fp)
        w = to_wad(v)
        # `expected_wad` here is the *true* min (60-digit, dense grid). The Rust
        # impl uses a cheaper sample-and-refine search (it must run on-chain), so
        # the tolerance is deliberately loose — ~1e-4 relative with a floor.
        # build.md §6 item 3 (Sprint 4) hardens the real guarantee ("never
        # under-collateralised", fuzz vs a brute-force grid oracle).
        tol = max(int(mp.ceil(abs(w) * mp.mpf("1e-4"))), 10000)
        cases.append({
            "label": label,
            "g": {"mu_wad": str(to_wad(gp[0])), "sigma_wad": str(to_wad(gp[1])), "lambda_wad": str(to_wad(gp[2]))},
            "f": {"mu_wad": str(to_wad(fp[0])), "sigma_wad": str(to_wad(fp[1])), "lambda_wad": str(to_wad(fp[2]))},
            "expected_wad": str(w), "tol_abs": str(tol),
        })

    add("identical (g==f) ⇒ 0",            "0", "10", "0", "10")
    add("g sharper, same mean (taller at center, but f wins in the tails)", "0", "5", "0", "10")
    add("g wider, same mean (g shorter at center; min is at the center)",   "0", "20", "0", "10")
    add("g shifted right, same width",     "30", "10", "0", "10")
    add("g shifted left, same width",      "-25", "10", "0", "10")
    add("g sharper and shifted",           "12", "3", "0", "10")
    add("g wider and shifted",             "8", "40", "0", "10")
    add("far apart, similar width",        "100", "10", "-100", "12")
    add("nearly delta g vs broad f",       "0", "0.05", "1", "10")
    add("broad g vs nearly delta f",       "0", "10", "0.5", "0.05")
    add("tiny shift, sharp curves",        "0.01", "0.1", "0", "0.1")
    add("arbitrary λ, g taller everywhere not possible (different μ)", "5", "2", "-5", "8", lam_g=mp.mpf("50"), lam_f=mp.mpf("80"))
    add("market starts flat-ish, trader sharpens at a new center", "200", "8", "150", "60")
    add("big numbers",                     "1000", "200", "1200", "180")
    add("g identical shape, smaller λ ⇒ d≤0, min at μ", "0", "10", "0", "10", lam_g=mp.mpf("30"), lam_f=mp.mpf("90"))

    write("worst_case_collateral.json", {
        "fn": "worst_case_collateral(g,f) = max(0, -min_x (g(x)-f(x)))",
        "note": "g,f are scaled Gaussians (mu,sigma,lambda); lambda defaults to k*sqrt(2*sigma*sqrt(pi)) with k=100. Looser tol — numeric search; Sprint-4 fuzz vs brute-force grid is the hard guarantee.",
        "vectors": cases,
    })


def gen_constants():
    # The WAD-scaled compile-time constants kaido_math::consts must reproduce.
    write("constants.json", {
        "note": "WAD-scaled constants used by kaido-math; round-half-away-from-zero of the exact value.",
        "constants": {
            "WAD":            str(WAD),
            "LN2":            str(to_wad(mp.log(2))),
            "SQRT_PI":        str(to_wad(mp.sqrt(mp.pi))),
            "SQRT_2PI":       str(to_wad(mp.sqrt(2 * mp.pi))),
            "TWO_SQRT_PI":    str(to_wad(2 * mp.sqrt(mp.pi))),       # 2√π  (denom of σ_floor's √π · ...; also erf's 2/√π numerator base)
            "TWO_OVER_SQRT_PI": str(to_wad(2 / mp.sqrt(mp.pi))),    # 2/√π — erf series prefactor
            "PI":             str(to_wad(mp.pi)),
        },
    })


if __name__ == "__main__":
    gen_constants()
    gen_exp()
    gen_erf()
    gen_gaussian()
    gen_worst_case()
    print("done.")
