import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalArtifactStore } from "../src/pet-content/artifacts.js";

const rootDir = await mkdtemp(path.join(os.tmpdir(), "hashiden-artifacts-"));

try {
  const store = new LocalArtifactStore({
    rootDir,
    publicBaseUrl: "http://localhost:3100/assets/pets/",
  });
  const key = "pets/Mint123/lives/life-1/v1/dp.png";
  const payload = Buffer.from("square-dp");
  const placed = await store.put(key, payload, "image/png");

  assert.equal(
    placed.url,
    "http://localhost:3100/assets/pets/pets/Mint123/lives/life-1/v1/dp.png",
  );
  assert.deepEqual(
    await readFile(path.join(rootDir, ...key.split("/"))),
    payload,
  );
  await assert.rejects(
    () => store.put("../outside.png", payload, "image/png"),
    /invalid local pet artifact key/,
  );
  await assert.rejects(
    () => store.put("pets//dp.png", payload, "image/png"),
    /invalid local pet artifact key/,
  );
} finally {
  await rm(rootDir, { recursive: true, force: true });
}

console.log("local artifact store OK");
