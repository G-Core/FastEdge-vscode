import { getEnv } from "fastedge::env";

async function eventHandler(event) {
  const envVar = getEnv("test") ?? "not_found";
  const countryCode = event.request.headers.get("geoip-country-code");

  return new Response(
    `Custom Environment Variable from ".vcsode/launch.json" \n
       customEnvVariable: ${envVar} \n
       countryCode: ${countryCode} \n
    `
  );
}

addEventListener("fetch", (event) => {
  event.respondWith(eventHandler(event));
});
