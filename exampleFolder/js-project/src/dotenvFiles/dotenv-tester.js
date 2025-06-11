import { getEnv } from "fastedge::env";
import { getSecret } from "fastedge::secret";

async function eventHandler(event) {
  const allValues = {
    envVariables: {
      // These come from top-level .env file
      VAR_1: getEnv("VAR_1"),
      VAR_2: getEnv("VAR_2"),
      VAR_3: getEnv("VAR_3"),
      VAR_4: getEnv("VAR_4"),
      // These comes from the .env.variables file
      ENV_VARIABLE_1: getEnv("ENV_VARIABLE_1"),
      ENV_VARIABLE_2: getEnv("ENV_VARIABLE_2"),
      // This will be "null" - no named variables allowed in .env.variables file
      ENV_VARIABLE_3_INVALID: getEnv("ENV_VARIABLE_3"),
    },
    secrets: {
      // These come from top-level .env file
      JWT_SECRET: getSecret("JWT_SECRET"),
      SECRET_ACCESS_KEY: getSecret("secret-access-key"),
      // These comes from the .env.secrets file
      SECRET_1: getSecret("SECRET_1"),
      SECRET_2: getSecret("SECRET_2"),
      // This will be "null" - no named variables allowed in .env.secrets file
      SECRET_3_INVALID: getSecret("SECRET_3"),
    },
    reqHeaders: {
      // These come from top-level .env file
      CONTENT_TYPE: event.request.headers.get("Content-Type"),
      X_CUSTOM_HEADER: event.request.headers.get("x-custom-header"),
      // These comes from the .env.req_headers file
      X_CUSTOM_REQ_HEADER: event.request.headers.get("x-custom-request-header"),
      X_CUSTOM_REQ_HEADER_2: event.request.headers.get(
        "x-custom-request-header-2"
      ),
      // This will be "null" - no named variables allowed in .env.req_headers file
      SOME_OTHER_HEADER_INVALID: event.request.headers.get("SOME_OTHER_HEADER"),
    },
  };
  return new Response(JSON.stringify(allValues, null, 2), {
    /*
    * This is not required as from the .env file we are already including
    * response headers that have "Content-Type" set to "application/json"
    *

    headers: {
      "Content-Type": "application/json",
    },
    */
  });
}

addEventListener("fetch", (event) => {
  event.respondWith(eventHandler(event));
});
