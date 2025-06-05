import { getEnv } from "fastedge::env";
import { getSecret } from "fastedge::secret";

async function eventHandler(event) {
  const allValues = {
    arguments: {
      ENV_VAR_1: getEnv("ENV_VAR_1"),
      ENV_VAR_2: getEnv("ENV_VAR_2"),
      SECRET_VAR_1: getSecret("SECRET_VAR_1"),
      SECRET_VAR_2: getSecret("SECRET_VAR_2"),
      req_header_geoip_country_code: event.request.headers.get("req-header-1"),
      req_header_some_other_header:
        event.request.headers.get("some-other-header"),
    },
    variables: {
      dotenv_var: getEnv("VAR_1"),
      dotenv_var_named: getEnv("VAR_2"),
      varaibles_var3: getEnv("VAR_3"),
      varaibles_var4_named: getEnv("VAR_4_named"),
    },
    secrets: {
      secretDotEnv1: getSecret("secretDotEnv1"),
      secretSecretEnv1: getSecret("secretSecretEnv1"),
      secretSecretEnv2_named: getSecret("secretSecretEnv2_named"),
    },
    reqHeaders: {
      reqHeaderDotEnv1: event.request.headers.get("reqHeaderDotEnv1"),
      reqHeaderReqEnv2: event.request.headers.get("reqHeaderReqEnv2"),
      reqHeaderReqEnv3_named: event.request.headers.get(
        "reqHeaderReqEnv3_named"
      ),
    },
  };
  return new Response(JSON.stringify(allValues, null, 2), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

addEventListener("fetch", (event) => {
  event.respondWith(eventHandler(event));
});
