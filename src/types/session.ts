export interface RawSessionData {
  type: "user" | "assistant" | "summary";
  timestamp?: string;
  message?: {
    content: string | ContentItem[];
  };
  uuid?: string;
  sessionId?: string;
  cwd?: string;
}

export interface ContentItem {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  name?: string;
  tool_use_id?: string;
}

export interface SessionSummary {
  sessionId: string;
  filePath: string;
  startTimestamp: Date;
  lastTimestamp: Date | undefined;
  firstUserMessage: string;
  messageCount: number;
  fileSize: number;
  modificationTime: Date;
  matchedSummaries: string[] | undefined;
  previewMessages?: ParsedMessage[];
  projectPath?: string | undefined;
}

export interface ParsedMessage {
  type: "user" | "assistant";
  timestamp: string;
  typeLabel: string;
  content: string;
  isToolUse: boolean;
}

export interface SessionParseOptions {
  maxLines?: number;
  includeSummaries?: boolean;
}
