import { execFile, execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const clientPath = join(tmpdir(), "openapi-fetch-client-gen-test-client.mjs");
execFileSync(process.execPath, ["index.js", "openapi.json", clientPath], { stdio: "inherit" });

const { ApiClient } = await import(`${clientPath}?t=${Date.now()}`);

const client = new ApiClient("http://localhost:3000/api");

async function testUrlInput() {
  const server = createServer(async (_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(await readFile("openapi.json"));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const urlClientPath = join(tmpdir(), "openapi-fetch-client-gen-url-test-client.mjs");

  try {
    await execFileAsync(process.execPath, ["index.js", `http://127.0.0.1:${port}/openapi.json`, urlClientPath]);
  } finally {
    rmSync(urlClientPath, { force: true });
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function test() {
  console.log("=== list exercises ===");
  const exercises = await client.listExercises();
  console.log(exercises.map((e) => e.name));

  console.log("\n=== create workout ===");
  const workout = await client.createWorkouts({
    body: { started_at: "2024-06-01T10:00:00Z" },
  });
  console.log("created:", workout.id);

  console.log("\n=== get workout ===");
  const fetched = await client.getWorkoutsById({ pk_id: workout.id });
  console.log("got:", fetched.id);

  console.log("\n=== update workout ===");
  const updated = await client.updateWorkouts({
    pk_id: workout.id,
    body: { ended_at: "2024-06-01T11:00:00Z", total_gym_time: 3600 },
  });
  console.log("updated:", updated.ended_at, updated.total_gym_time);

  console.log("\n=== create workout exercise ===");
  const we = await client.createWorkoutExercises({
    body: {
      workout_id: workout.id,
      exercise_id: 1,
      weight: 150,
      reps: 10,
      time: 60,
    },
  });
  console.log("we:", we.id);

  console.log("\n=== delete workout exercise ===");
  await client.deleteWorkoutExercises({ pk_id: we.id });

  console.log("\n=== delete workout ===");
  await client.deleteWorkouts({ pk_id: workout.id });

  console.log("\n=== verify deleted ===");
  try {
    await client.getWorkoutsById({ pk_id: workout.id });
  } catch (e) {
    console.log("expected error:", e.message);
  }

  console.log("\n=== All tests passed ===");
}

try {
  await testUrlInput();
  await test();
} finally {
  rmSync(clientPath, { force: true });
}
