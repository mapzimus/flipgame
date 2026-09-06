import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA_RE = /^[0-9a-f]{40}$/i;
const DEFAULT_ORIGINS = [
  "https://mapzimus.github.io/flipgame/",
  "https://mapzimus.com/flipgame/",
];

function fail(message) {
  throw new Error(`Dual deployment verification failed: ${message}`);
}

function parseArgs(argv) {
  const output = { origins: DEFAULT_ORIGINS.slice() };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) fail(`missing value for ${flag || "argument"}`);
    if (flag === "--sha") output.sha = value;
    else if (flag === "--origin-a") output.origins[0] = value;
    else if (flag === "--origin-b") output.origins[1] = value;
    else fail(`unknown argument ${flag}`);
  }
  if (!SHA_RE.test(output.sha || "")) fail("--sha must be a full Git commit");
  output.origins = output.origins.map((origin) => {
    const url = new URL(origin);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      fail(`origin must use HTTPS: ${origin}`);
    }
    return new URL(url.href.endsWith("/") ? url.href : `${url.href}/`);
  });
  return output;
}

async function fetchBytes(url) {
  const response = await fetch(url, { cache: "no-store", redirect: "error" });
  if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function digest(runtimeFiles, bytesByPath) {
  const hash = crypto.createHash("sha256");
  for (const relative of runtimeFiles) {
    hash.update(relative, "utf8");
    hash.update("\0");
    hash.update(bytesByPath.get(relative));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function validateMetadata(metadata, expectedSha, expectedVersion, origin) {
  if (!metadata || metadata.schema !== "MapzimusVendorSnapshotV1" || metadata.snapshotVersion !== 1) {
    fail(`${origin} has invalid provenance schema`);
  }
  if (metadata.upstream?.repository !== "mapzimus/flipgame" ||
      metadata.upstream?.sourceSha !== expectedSha ||
      metadata.upstream?.releaseVersion !== expectedVersion) {
    fail(`${origin} provenance does not identify ${expectedVersion} at ${expectedSha}`);
  }
  if (!Array.isArray(metadata.runtimeFiles) || !metadata.runtimeFiles.length ||
      !/^[0-9a-f]{64}$/i.test(metadata.contentSha256 || "")) {
    fail(`${origin} provenance has no bounded runtime manifest/digest`);
  }
  const unique = new Set(metadata.runtimeFiles);
  if (unique.size !== metadata.runtimeFiles.length ||
      metadata.runtimeFiles.some((relative) => !/^(?:index\.html|service-worker\.js|manifest\.json|\.nojekyll|(?:css|js|icons)\/[A-Za-z0-9._/-]+)$/.test(relative) || relative.includes(".."))) {
    fail(`${origin} provenance contains an unsafe or duplicate runtime path`);
  }
}

export async function verifyDualDeployment({ sha, origins, retries = 36, retryMs = 5000 }) {
  const interfaces = await import(pathToFileURL(path.join(REPO_ROOT, "js", "v111-interfaces.js")).href);
  const expectedVersion = interfaces.default?.RELEASE_VERSION || interfaces.RELEASE_VERSION;
  if (!/^v\d+\.\d+$/.test(expectedVersion || "")) fail("local release metadata is invalid");
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const snapshots = [];
      for (const origin of origins) {
        const nonce = `verify=${encodeURIComponent(sha)}-${attempt}`;
        const metadataBytes = await fetchBytes(new URL(`release-provenance.json?${nonce}`, origin));
        const metadata = JSON.parse(metadataBytes.toString("utf8"));
        validateMetadata(metadata, sha, expectedVersion, origin.href);
        const bytesByPath = new Map();
        for (const relative of metadata.runtimeFiles) {
          bytesByPath.set(relative, await fetchBytes(new URL(`${relative}?${nonce}`, origin)));
        }
        const actualDigest = digest(metadata.runtimeFiles, bytesByPath);
        if (actualDigest !== metadata.contentSha256) fail(`${origin.href} runtime digest mismatch`);
        const index = bytesByPath.get("index.html")?.toString("utf8") || "";
        if (!index.includes(`id="version-badge"`) || !index.includes(`>${expectedVersion}</`)) {
          fail(`${origin.href} does not visibly report ${expectedVersion}`);
        }
        snapshots.push({ metadata, actualDigest });
      }
      if (snapshots[0].actualDigest !== snapshots[1].actualDigest ||
          snapshots[0].metadata.contentSha256 !== snapshots[1].metadata.contentSha256 ||
          JSON.stringify(snapshots[0].metadata.runtimeFiles) !== JSON.stringify(snapshots[1].metadata.runtimeFiles)) {
        fail("the two origins do not serve the same runtime tree");
      }
      return snapshots;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
  throw lastError;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const options = parseArgs(process.argv.slice(2));
  verifyDualDeployment({ sha: options.sha, origins: options.origins })
    .then(() => console.log(`Both Flipgame origins match ${options.sha}.`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
