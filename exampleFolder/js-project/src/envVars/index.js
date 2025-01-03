import { getEnv } from "fastedge::env";

async function eventHandler(event) {
  console.log("Custom Environment Variable 1111");
  const envVar = getEnv("test") ?? "not_found";
  console.log("Custom Environment Variable 22233", envVar);
  return new Response(
    `Custom Environment Variable from ".vcsode/launch.json" \n
       customEnvVariable: ${envVar} \n
    `
  );
}

addEventListener("fetch", (event) => {
  event.respondWith(eventHandler(event));
});
