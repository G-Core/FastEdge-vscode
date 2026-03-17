type ExtLanguage = "javascript" | "rust" | "assemblyscript";
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

export {
  BinaryInfo,
  DebugContext,
  ExtLanguage,
  LogToDebugConsole,
  MCPConfiguration,
};
