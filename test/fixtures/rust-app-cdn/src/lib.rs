use proxy_wasm::traits::*;
use proxy_wasm::types::*;

proxy_wasm::main! {{
    proxy_wasm::set_log_level(LogLevel::Trace);
    proxy_wasm::set_root_context(|_| -> Box<dyn RootContext> { Box::new(FixtureRoot) });
}}

struct FixtureRoot;

impl Context for FixtureRoot {}

impl RootContext for FixtureRoot {
    fn create_http_context(&self, context_id: u32) -> Option<Box<dyn HttpContext>> {
        Some(Box::new(Fixture { context_id }))
    }

    fn get_type(&self) -> Option<ContextType> {
        Some(ContextType::HttpContext)
    }
}

struct Fixture {
    context_id: u32,
}

impl Context for Fixture {}

impl HttpContext for Fixture {
    fn on_http_request_headers(&mut self, _: usize, _: bool) -> Action {
        self.set_http_request_header("x-fixture", Some(&self.context_id.to_string()));
        Action::Continue
    }
}
