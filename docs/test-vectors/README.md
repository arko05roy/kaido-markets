# Cross-language conformance test vectors

The single source of truth for Gaussian / curve-fit math. Every `*.json` file
here is executed by **both** `kaido-math` (Rust) and `web/lib/curve` (TS), so a
mismatch fails CI on both sides. This is the contract that prevents
"drew X, recorded Y" disputes (ADR-8). Populated from Sprint 1.
