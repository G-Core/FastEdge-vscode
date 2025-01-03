type ExtLanguage = "javascript" | "rust";
type DebugContext = "file" | "workspace";

type BinaryInfo = {
  path: string;
  lang: ExtLanguage;
};

export { BinaryInfo, DebugContext, ExtLanguage };
