import { getEnv } from "fastedge::env";

async function eventHandler(event) {
  console.log("Custom Environment Variable 1111");
  const envVar = getEnv("test") ?? "not_found";
  console.log("Custom Environment Variable 22233", envVar);

  const countryCode = event.request.headers.get("geoip-country-code");
  console.log("Farq: eventHandler -> countryCode", countryCode);

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
