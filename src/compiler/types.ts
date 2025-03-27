type ExtLanguage = "javascript" | "rust";
type DebugContext = "file" | "workspace";

type BinaryInfo = {
  path: string;
  lang: ExtLanguage;
};

type LogToDebugConsole = (message: string, type?: "stdout" | "stderr") => void;

interface LaunchConfiguration {
  cliPath?: string;
  entrypoint?: string;
  binary?: string;
  port?: number;
  geoIpHeaders?: boolean;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  secrets?: Record<string, string>;
  memoryLimit?: number;
  traceLogging?: boolean;
}

export {
  BinaryInfo,
  DebugContext,
  ExtLanguage,
  LaunchConfiguration,
  LogToDebugConsole,
};
