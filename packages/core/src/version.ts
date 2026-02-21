/**
 * Package version — single source of truth for the compiled binary.
 *
 * In dev / Node.js mode the version is also readable from package.json, but
 * in a Bun-compiled standalone binary import.meta.url resolves into the
 * virtual FS (/$bunfs/) and package.json is not bundled.  This file is the
 * authoritative version string for both execution contexts.
 *
 * Updated automatically by scripts/set-version.sh — do not edit by hand.
 */

export const VERSION = '2026.2.20';
