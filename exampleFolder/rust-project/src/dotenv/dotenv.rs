use fastedge::{
    body::Body,
    http::{header, Error, Request, Response, StatusCode},
    secret,
};
use serde_json::json;
use std::env;

#[fastedge::http]
fn main(req: Request<Body>) -> Result<Response<Body>, Error> {
    // Collect environment variables
    let env_variables = json!({
        // These come from top-level .env file
        "VAR_1": env::var("VAR_1").ok(),
        "VAR_2": env::var("VAR_2").ok(),
        "VAR_3": env::var("VAR_3").ok(),
        "VAR_4": env::var("VAR_4").ok(),
        // These comes from the .env.variables file
        "ENV_VARIABLE_1": env::var("ENV_VARIABLE_1").ok(),
        "ENV_VARIABLE_2": env::var("ENV_VARIABLE_2").ok(),
        // This will be "null" - no named variables allowed in .env.variables file
        "ENV_VARIABLE_3_INVALID": env::var("ENV_VARIABLE_3").ok(),
    });

    // Collect secrets
    let secrets = json!({
        // These come from top-level .env file
        "JWT_SECRET": secret::get("JWT_SECRET").unwrap_or(None),
        "SECRET_ACCESS_KEY": secret::get("secret-access-key").unwrap_or(None),
        // These comes from the .env.secrets file
        "SECRET_1": secret::get("SECRET_1").unwrap_or(None),
        "SECRET_2": secret::get("SECRET_2").unwrap_or(None),
         // This will be "null" - no named variables allowed in .env.secrets file
        "SECRET_3_INVALID": secret::get("SECRET_3").unwrap_or(None),
    });

    // Collect request headers
    let req_headers = json!({
        // These come from top-level .env file
        "CONTENT_TYPE": req.headers().get("Content-Type").and_then(|h| h.to_str().ok()),
        "X_CUSTOM_HEADER": req.headers().get("x-custom-header").and_then(|h| h.to_str().ok()),
        // These comes from the .env.req_headers file
        "X_CUSTOM_REQ_HEADER": req.headers().get("x-custom-request-header").and_then(|h| h.to_str().ok()),
        "X_CUSTOM_REQ_HEADER_2": req.headers().get("x-custom-request-header-2").and_then(|h| h.to_str().ok()),
        // This will be "null" - no named variables allowed in .env.req_headers file
        "SOME_OTHER_HEADER_INVALID": req.headers().get("SOME_OTHER_HEADER").and_then(|h| h.to_str().ok()),
    });
    // Combine all data into a single JSON object
    let all_values = json!({
        "envVariables": env_variables,
        "secrets": secrets,
        "reqHeaders": req_headers,
    });

    // Convert the JSON object to a string
    let body = match serde_json::to_string_pretty(&all_values) {
        Ok(body) => body,
        Err(e) => {
            let error_body = json!({
                "error": "Error serializing JSON",
                "details": e.to_string()
            });
            let error_json = serde_json::to_string_pretty(&error_body)
                .unwrap_or_else(|_| "{\"error\":\"Unknown error occurred\"}".to_string());

            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(error_json));
        }
    };

    // Return the JSON response
    let rsp = Response::builder()
        .status(StatusCode::OK)
        /*
        * This is not required as from the .env file we are already including
        * response headers that have "Content-Type" set to "application/json"
        *
        .header(header::CONTENT_TYPE, "application/json")
        */
        .body(Body::from(body))?;

    Ok(rsp)
}
