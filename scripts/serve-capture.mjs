/*
  `npm run demo:serve` — the production build on http://localhost:3000 with the dev
  outbox switched on, for `npm run demo:capture`. The webpack dev server recompiles
  under the capture's feet and drops server-action requests mid-compile; a production
  build doesn't. Run `npm run build` first. Local only: the outbox refuses to run unless
  APP_BASE_URL is localhost (src/lib/devOutbox.ts).
*/
import { spawn } from "node:child_process";

const port = process.env.PORT ?? "3000";
const child = spawn("npx", ["next", "start", "-p", port], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DEV_OUTBOX: "1", APP_BASE_URL: `http://localhost:${port}` },
});
child.on("exit", (code) => process.exit(code ?? 0));
