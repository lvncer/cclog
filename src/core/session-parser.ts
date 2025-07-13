import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import {
  RawSessionData,
  SessionSummary,
  ParsedMessage,
  SessionParseOptions,
  ContentItem,
} from "../types/session";

export class SessionParser {
  constructor(private readonly filePath: string) {}

  async parseMinimal(
    options: SessionParseOptions = {}
  ): Promise<SessionSummary> {
    const { maxLines = 20, includeSummaries = false } = options;

    const stats = await fs.promises.stat(this.filePath);
    const sessionId = path.basename(this.filePath, ".jsonl");

    let startTimestamp: Date | undefined;
    let lastTimestamp: Date | undefined;
    let firstUserMessage = "";
    let lineCount = 0;
    let userMessageCount = 0;
    const matchedSummaries: string[] = [];

    const fileStream = fs.createReadStream(this.filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const lines: string[] = [];

    for await (const line of rl) {
      if (!line.trim()) continue;

      lineCount++;
      lines.push(line);

      if (lineCount <= maxLines) {
        try {
          const data: RawSessionData = JSON.parse(line);

          if (!startTimestamp && data.timestamp) {
            startTimestamp = new Date(data.timestamp);
          }

          if (this.isUserMessage(data)) {
            const text = this.extractUserMessage(data).trim();
            if (text.length > 0) {
              userMessageCount++;
              if (!firstUserMessage) {
                firstUserMessage = text;
              }
            }
          }

          if (includeSummaries && data.type === "summary") {
            // Summary processing (simplified)
          }
        } catch (error) {
          // Skip invalid JSON
        }
      }
    }

    // Parse last line for end timestamp
    if (lines.length > 0) {
      try {
        const lastData: RawSessionData = JSON.parse(lines[lines.length - 1]!);
        if (lastData.timestamp) {
          lastTimestamp = new Date(lastData.timestamp);
        }
      } catch (error) {
        lastTimestamp = startTimestamp;
      }
    }

    if (!startTimestamp) {
      throw new Error(`No valid timestamp found in ${this.filePath}`);
    }

    // Get preview messages
    const previewMessages = await this.parsePreview(10);

    return {
      sessionId,
      filePath: this.filePath,
      startTimestamp,
      lastTimestamp,
      firstUserMessage: firstUserMessage || "no user message",
      messageCount: userMessageCount,
      fileSize: stats.size,
      modificationTime: stats.mtime,
      matchedSummaries:
        matchedSummaries.length > 0 ? matchedSummaries : undefined,
      previewMessages,
    };
  }

  async parseForDisplay(): Promise<ParsedMessage[]> {
    const fileStream = fs.createReadStream(this.filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const messages: ParsedMessage[] = [];

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const data: RawSessionData = JSON.parse(line);
        if (data.type === "user" || data.type === "assistant") {
          messages.push(this.formatMessage(data));
        }
      } catch (error) {
        // Skip invalid JSON
      }
    }

    return messages;
  }

  async parsePreview(maxLines: number = 10): Promise<ParsedMessage[]> {
    const fileStream = fs.createReadStream(this.filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const messages: ParsedMessage[] = [];
    let lineCount = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const data: RawSessionData = JSON.parse(line);
        if (data.type === "user" || data.type === "assistant") {
          // Skip tool use messages
          if (!this.isToolMessage(data.message?.content)) {
            messages.push(this.formatMessage(data));
            lineCount++;

            if (lineCount >= maxLines) {
              break;
            }
          }
        }
      } catch (error) {
        // Skip invalid JSON
      }
    }

    return messages;
  }

  private isUserMessage(data: RawSessionData): boolean {
    return data.type === "user";
  }

  private extractUserMessage(data: RawSessionData): string {
    const content = data.message?.content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      const textItem = content.find(
        (item: ContentItem) => item.type === "text"
      );
      return textItem?.text || "";
    }

    return "";
  }

  private formatMessage(data: RawSessionData): ParsedMessage {
    const timestamp = data.timestamp
      ? new Date(data.timestamp).toLocaleTimeString()
      : "00:00:00";

    const typeLabel = data.type === "user" ? "User      " : "Assistant ";

    let content = "";
    const messageContent = data.message?.content;

    if (typeof messageContent === "string") {
      content = messageContent;
    } else if (Array.isArray(messageContent)) {
      // Handle array content more intelligently
      const textItems = messageContent.filter(
        (item: ContentItem) => item.type === "text"
      );
      const toolItems = messageContent.filter(
        (item: ContentItem) =>
          item.type === "tool_use" || item.type === "tool_result"
      );

      if (textItems.length > 0) {
        content = textItems.map((item: ContentItem) => item.text).join(" ");
      } else if (toolItems.length > 0) {
        content = `[${toolItems.length} tool ${
          toolItems.length === 1 ? "call" : "calls"
        }]`;
      } else {
        content = "[complex content]";
      }
    } else if (messageContent === undefined || messageContent === null) {
      content = "[no content]";
    } else {
      content = "[unknown content type]";
    }

    return {
      type: data.type as "user" | "assistant",
      timestamp,
      typeLabel,
      content:
        content.replace(/\n/g, " ").substring(0, 200) +
        (content.length > 200 ? "..." : ""),
      isToolUse: this.isToolMessage(messageContent),
    };
  }

  private isToolMessage(content: string | ContentItem[] | undefined): boolean {
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      if (first) {
        return first.type === "tool_result" || first.type === "tool_use";
      }
    }
    return false;
  }
}
