type ExtLanguage = "javascript" | "rust";
type DebugContext = "file" | "workspace";

type BinaryInfo = {
  path: string;
  lang: ExtLanguage;
};

type LogToDebugConsole = (message: string, type?: "stdout" | "stderr") => void;

export { BinaryInfo, DebugContext, ExtLanguage, LogToDebugConsole };
