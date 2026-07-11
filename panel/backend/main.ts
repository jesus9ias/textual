/**
 * Local-only entrypoint. Binds strictly to loopback (127.0.0.1) — the panel
 * backend is never exposed to a network interface beyond localhost and is never
 * deployed.
 */
import { loadConfig } from './lib/config.ts';
import { createStore } from './lib/store.ts';
import { createServer } from './server.ts';

// Load ./.env into process.env (Node's built-in loader). Optional: the vars may
// already be set in the environment, in which case there is no .env file.
try {
  process.loadEnvFile();
} catch {
  // No .env file present — rely on the ambient environment.
}

const config = loadConfig();
const store = createStore({
  contentRoot: config.contentRoot,
  configRoot: config.configRoot,
  manifestPath: config.manifestPath,
});
const server = createServer(store);

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Panel backend listening on http://127.0.0.1:${config.port}`);
});
