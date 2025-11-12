type ExtLanguage = "javascript" | "rust";
type DebugContext = "file" | "workspace";

type BinaryInfo = {
  path: string;
  lang: ExtLanguage;
};

type LogToDebugConsole = (message: string, type?: "stdout" | "stderr") => void;

type MCPServerConfiguration = Record<string, unknown>;
interface MCPConfiguration {
  servers: Record<string, MCPServerConfiguration>;
}

interface LaunchConfiguration {
  cliPath: string;
  entrypoint?: string;
  binary?: BinaryInfo;
  port?: number;
  dotenv?: boolean | string;
  geoIpHeaders?: boolean;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  secrets?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  memoryLimit?: number;
  traceLogging?: boolean;
}

export {
  BinaryInfo,
  DebugContext,
  ExtLanguage,
  LaunchConfiguration,
  LogToDebugConsole,
  MCPConfiguration,
};
