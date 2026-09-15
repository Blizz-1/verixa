// Curated public surface of @verixa/stellar-anchor. See
// docs/guides/stellar-anchoring.md and docs/adr/0003-stellar-audit-anchoring.md.

// The port and its types — what consumers depend on. Nothing here mentions
// Stellar, so a consumer can be written (and tested) against anchoring in
// general, then wired to a specific ledger at composition time.
export { AnchorError, isValidSha256Hex } from "./application/ports/hash-anchor.js";
export type { AnchorReceipt, HashAnchor } from "./application/ports/hash-anchor.js";

// The Stellar adapter.
export { StellarHashAnchor } from "./infrastructure/stellar/stellar-hash-anchor.js";
export type {
  StellarHashAnchorOptions,
  StellarNetwork,
} from "./infrastructure/stellar/stellar-hash-anchor.js";

// Test double, exported deliberately: consumers testing their own anchoring
// logic need it, and it doubles as the "anchoring disabled" implementation
// for deployments that want no ledger dependency at all.
export { InMemoryHashAnchor } from "./infrastructure/testing/in-memory-hash-anchor.js";

// `hashAnchorContract` is deliberately NOT exported here.
//
// It imports `vitest`, and this file is a *runtime* entry point. Exporting it
// meant that merely importing `@verixa/stellar-anchor` in a production process
// loaded vitest, which then threw "Vitest failed to access its internal state"
// and killed the process at startup — a failure no test could catch, because
// under vitest the import succeeds.
//
// The intent behind exporting it was sound: any future HashAnchor
// implementation should be able to prove it behaves identically rather than
// merely compiling against the same interface. Both existing consumers reach
// it by relative path, which is enough for now. Giving it a `./testing`
// subpath export is the right answer if an out-of-repo implementation ever
// needs it, and that is a packaging change rather than a line in this file.
