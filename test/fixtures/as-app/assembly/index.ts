// Minimal FastEdge CDN app. Mirrors proxy-wasm-sdk-as/examples/helloWorld so
// the build exercises the real toolchain: the proxy-wasm SDK, the wasi-shim
// asconfig `extends`, and the `abort=abort_proc_exit` binding. A fixture
// without those compiles cleanly while a real app breaks.
export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
import {
  Context,
  FilterHeadersStatusValues,
  log,
  LogLevelValues,
  registerRootContext,
  RootContext,
} from "@gcoredev/proxy-wasm-sdk-as/assembly";

class FixtureRoot extends RootContext {
  createContext(context_id: u32): Context {
    return new Fixture(context_id, this);
  }
}

class Fixture extends Context {
  constructor(context_id: u32, root_context: FixtureRoot) {
    super(context_id, root_context);
  }

  onRequestHeaders(
    headers: u32,
    end_of_stream: bool,
  ): FilterHeadersStatusValues {
    log(LogLevelValues.info, "onRequestHeaders >> fixture");
    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new FixtureRoot(context_id);
}, "fixture");
