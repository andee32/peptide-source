import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import app from "../../src/app";
import { pool } from "@app/db";

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

// Binds the real Express app on an ephemeral port. node:test runs each test file
// in its own process, so the @app/db pool singleton is per-file and closing it
// here does not affect other files.
export async function startTestServer(): Promise<TestServer> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      await pool.end();
    },
  };
}
