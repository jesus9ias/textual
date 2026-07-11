/**
 * Determines the exact set of CloudFront paths to invalidate for a publish,
 * sourced from the manifest the panel maintains directly (see
 * panel/spec.md's Publish Invalidation Manifest). Replaces the git-diff-based
 * detect-changed-views.mjs (see blog/spec.md Decisions Log, 2026-07-10).
 *
 * Mechanism: the manifest is a plain-text, append-only file — one CloudFront
 * path per line, plus manually-inserted cut-marker lines (`---YYYY/MM/DD`)
 * that delimit "already published" from "pending". The pure
 * `computeInvalidationPaths` core takes every line after the last cut marker
 * (the whole file if none exists yet), unions it with the always-invalidate
 * set, and de-duplicates. The CLI wrapper below only reads the manifest and
 * `site.config.json` — it never writes to either.
 */
import { alwaysInvalidatePaths } from '../src/lib/routing.mjs';

const CUT_MARKER_PREFIX = '---';

/** True when a manifest line is a cut marker rather than a literal path. */
export function isCutMarker(line) {
  return line.startsWith(CUT_MARKER_PREFIX);
}

/** Lines after the last cut marker (the whole file if none exists), blanks dropped. */
function pendingPaths(manifestLines) {
  const lastCutIndex = manifestLines.reduce((last, line, i) => (isCutMarker(line) ? i : last), -1);
  return manifestLines.slice(lastCutIndex + 1).filter((line) => line.trim().length > 0);
}

/**
 * Pure core: maps manifest lines + the always-invalidate set to the final,
 * de-duplicated CloudFront invalidation path list.
 *
 * @param {object} input
 * @param {string[]} input.manifestLines
 * @param {string[]} input.alwaysInvalidate
 * @returns {string[]}
 */
export function computeInvalidationPaths({ manifestLines, alwaysInvalidate }) {
  return [...new Set([...pendingPaths(manifestLines), ...alwaysInvalidate])];
}

// --- I/O wrapper (real CI runs) --------------------------------------------

async function defaultLoadInput() {
  const path = await import('node:path');
  const { readFileSync } = await import('node:fs');

  const cwd = process.cwd();
  // cwd is blog/frontend (workflow's working-directory); the manifest lives
  // at the repo root, two levels up, so editing it never matches the
  // blog/frontend/** path filter and re-triggers a deploy.
  const manifestPath = path.join(cwd, '..', '..', 'invalidation-manifest.txt');
  const siteConfig = JSON.parse(readFileSync(path.join(cwd, 'src', 'site.config.json'), 'utf8'));

  let manifestLines = [];
  try {
    manifestLines = readFileSync(manifestPath, 'utf8').split('\n').map((line) => line.trimEnd());
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // No manifest yet (e.g. the very first publish) — nothing pending.
  }

  return {
    manifestLines,
    alwaysInvalidate: alwaysInvalidatePaths(siteConfig.supportedLangs),
  };
}

async function main() {
  const input = await defaultLoadInput();
  const paths = computeInvalidationPaths(input);
  process.stdout.write(JSON.stringify(paths));
}

const { pathToFileURL } = await import('node:url');
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}
