# cclog TypeScript 版設計書

## 概要

cclog の TypeScript 実装により、型安全性と開発体験を向上させつつ、保守性の高いコードベースを構築する。

## アーキテクチャ

### ディレクトリ構造

```sh
cclog-ts/
├── package.json                    # TypeScript依存関係含む
├── tsconfig.json                   # TypeScript設定
├── build.js                        # ビルドスクリプト
├── bin/
│   └── cclog                       # エントリーポイント
├── src/                            # TypeScriptソース
│   ├── index.ts                    # メインエントリー
│   ├── types/
│   │   ├── session.ts              # セッション型定義
│   │   ├── project.ts              # プロジェクト型定義
│   │   └── ui.ts                   # UI型定義
│   ├── core/
│   │   ├── session-parser.ts       # セッション解析
│   │   ├── project-manager.ts      # プロジェクト管理
│   │   └── path-decoder.ts         # パスデコード
│   ├── ui/
│   │   ├── interactive-selector.ts # インタラクティブUI
│   │   ├── renderer.ts             # 表示レンダラー
│   │   └── colors.ts               # 色設定
│   └── utils/
│       ├── time-utils.ts           # 時間ユーティリティ
│       └── file-utils.ts           # ファイルユーティリティ
├── lib/                            # コンパイル後JavaScript
└── dist/                           # 配布用ファイル
```

## 型定義

### セッション関連型 (`src/types/session.ts`)

```typescript
export interface RawSessionData {
  type: "user" | "assistant" | "summary";
  timestamp?: string;
  message?: {
    content: string | ContentItem[];
  };
  uuid?: string;
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
  lastTimestamp?: Date;
  firstUserMessage: string;
  messageCount: number;
  fileSize: number;
  modificationTime: Date;
  matchedSummaries?: string[];
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
```

### プロジェクト関連型 (`src/types/project.ts`)

```typescript
export interface Project {
  encodedName: string;
  path: string;
  sessionCount: number;
  lastActivity: Date;
}

export interface ProjectDisplayItem {
  display: string;
  searchText: string;
  value: string;
  project: Project;
}
```

### UI 関連型 (`src/types/ui.ts`)

```typescript
export interface SelectableItem<T = any> {
  display: string;
  searchText: string;
  value: T;
}

export interface SelectorOptions {
  height?: number;
  preview?: (item: SelectableItem) => string;
  headerLines?: number;
  placeholder?: string;
}

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  action: string;
  description: string;
}

export interface ColorTheme {
  user: string;
  assistant: string;
  tool: string;
  highlight: string;
  info: string;
  error: string;
  success: string;
}
```

## 実装

### メインエントリー (`src/index.ts`)

```typescript
#!/usr/bin/env node

import { Command } from "commander";
import { ProjectManager } from "./core/project-manager";
import { SessionParser } from "./core/session-parser";
import { InteractiveSelector } from "./ui/interactive-selector";
import { renderSessionList, renderProjectList } from "./ui/renderer";
import { SelectableItem } from "./types/ui";

const program = new Command();

program
  .name("cclog")
  .description("Browse Claude Code conversation history")
  .version("1.0.0");

program
  .command("projects", { isDefault: false })
  .description("Browse all projects")
  .action(async () => {
    await showProjects();
  });

program
  .command("view")
  .description("View session content")
  .argument("<file>", "Session file path")
  .action(async (file: string) => {
    await viewSession(file);
  });

program.action(async () => {
  await showSessions();
});

async function showSessions(): Promise<void> {
  try {
    const projectManager = new ProjectManager();
    const sessions = await projectManager.getCurrentProjectSessions();

    const items: SelectableItem[] = sessions.map((session) => ({
      display: renderSessionList(session),
      searchText: `${session.sessionId} ${session.firstUserMessage}`,
      value: session.sessionId,
    }));

    const selector = new InteractiveSelector(items, {
      height: 20,
      headerLines: 3,
      preview: (item) => `Session: ${item.value}`,
    });

    const selected = await selector.show();
    if (selected) {
      console.log(selected.value);
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exit(1);
  }
}

async function showProjects(): Promise<void> {
  try {
    const projectManager = new ProjectManager();
    const projects = await projectManager.getAllProjects();

    const items: SelectableItem[] = projects.map((project) => ({
      display: renderProjectList(project),
      searchText: project.path,
      value: project.path,
    }));

    const selector = new InteractiveSelector(items, {
      height: 15,
      headerLines: 2,
    });

    const selected = await selector.show();
    if (selected) {
      console.log(`cd ${selected.value}`);
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exit(1);
  }
}

async function viewSession(filePath: string): Promise<void> {
  try {
    const parser = new SessionParser(filePath);
    const messages = await parser.parseForDisplay();

    for (const message of messages) {
      console.log(
        `${message.typeLabel}${message.timestamp}  ${message.content}`
      );
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exit(1);
  }
}

program.parse();
```

### セッションパーサー (`src/core/session-parser.ts`)

```typescript
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

          if (!firstUserMessage && this.isUserMessage(data)) {
            firstUserMessage = this.extractUserMessage(data);
          }

          if (includeSummaries && data.type === "summary") {
            // サマリー処理（実装省略）
          }
        } catch (error) {
          // Skip invalid JSON
        }
      }
    }

    // Parse last line for end timestamp
    if (lines.length > 0) {
      try {
        const lastData: RawSessionData = JSON.parse(lines[lines.length - 1]);
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

    return {
      sessionId,
      filePath: this.filePath,
      startTimestamp,
      lastTimestamp,
      firstUserMessage: firstUserMessage || "no user message",
      messageCount: lineCount,
      fileSize: stats.size,
      modificationTime: stats.mtime,
      matchedSummaries:
        matchedSummaries.length > 0 ? matchedSummaries : undefined,
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
      const textItem = messageContent.find(
        (item: ContentItem) => item.type === "text"
      );
      content = textItem?.text || "non-text content";
    }

    return {
      type: data.type as "user" | "assistant",
      timestamp,
      typeLabel,
      content: content.replace(/\n/g, " "),
      isToolUse: this.isToolMessage(messageContent),
    };
  }

  private isToolMessage(content: string | ContentItem[] | undefined): boolean {
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      return first.type === "tool_result" || first.type === "tool_use";
    }
    return false;
  }
}
```

### インタラクティブセレクター (`src/ui/interactive-selector.ts`)

```typescript
import * as readline from "readline";
import { SelectableItem, SelectorOptions, KeyBinding } from "../types/ui";
import { colors } from "./colors";

export class InteractiveSelector<T = any> {
  private items: SelectableItem<T>[];
  private filtered: SelectableItem<T>[];
  private selectedIndex = 0;
  private query = "";

  constructor(
    items: SelectableItem<T>[],
    private readonly options: SelectorOptions = {}
  ) {
    this.items = items;
    this.filtered = [...items];
    this.options = {
      height: 20,
      headerLines: 0,
      ...options,
    };
  }

  async show(): Promise<SelectableItem<T> | null> {
    if (this.items.length === 0) {
      return null;
    }

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      // Hide cursor and clear screen
      process.stdout.write("\x1b[?25l");
      this.clearScreen();

      const cleanup = (): void => {
        process.stdout.write("\x1b[?25h"); // Show cursor
        rl.close();
      };

      const handleKeypress = (str: string, key: readline.Key): void => {
        this.handleKey(key, cleanup, resolve);
      };

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }

      process.stdin.on("keypress", handleKeypress);
      this.render();
    });
  }

  private handleKey(
    key: readline.Key,
    cleanup: () => void,
    resolve: (value: SelectableItem<T> | null) => void
  ): void {
    switch (key.name) {
      case "up":
        if (this.selectedIndex > 0) {
          this.selectedIndex--;
          this.render();
        }
        break;

      case "down":
        if (this.selectedIndex < this.filtered.length - 1) {
          this.selectedIndex++;
          this.render();
        }
        break;

      case "return":
        cleanup();
        resolve(this.filtered[this.selectedIndex] || null);
        break;

      case "escape":
        cleanup();
        resolve(null);
        break;

      case "c":
        if (key.ctrl) {
          cleanup();
          process.exit(0);
        }
        break;

      case "backspace":
        if (this.query.length > 0) {
          this.query = this.query.slice(0, -1);
          this.filter();
          this.render();
        }
        break;

      default:
        if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
          this.query += key.sequence;
          this.filter();
          this.render();
        }
    }
  }

  private filter(): void {
    if (!this.query) {
      this.filtered = [...this.items];
    } else {
      this.filtered = this.items.filter((item) =>
        item.searchText.toLowerCase().includes(this.query.toLowerCase())
      );
    }
    this.selectedIndex = Math.min(this.selectedIndex, this.filtered.length - 1);
  }

  private render(): void {
    this.clearScreen();

    // Show search query
    console.log(`> ${this.query}`);
    console.log("");

    // Show header lines
    const headerItems = this.items.slice(0, this.options.headerLines);
    headerItems.forEach((item) => {
      console.log(colors.info(item.display));
    });

    // Show filtered items
    const displayItems = this.filtered.slice(0, this.options.height);

    displayItems.forEach((item, index) => {
      const isSelected = index === this.selectedIndex;
      const prefix = isSelected ? "> " : "  ";
      const line = `${prefix}${item.display}`;

      if (isSelected) {
        console.log(colors.highlight(line));
      } else {
        console.log(line);
      }
    });

    // Show preview if available
    if (this.options.preview && this.filtered[this.selectedIndex]) {
      console.log("\n" + "─".repeat(80));
      console.log(this.options.preview(this.filtered[this.selectedIndex]));
    }

    // Show help
    console.log(colors.info("\n↑↓: Navigate, Enter: Select, Ctrl+C: Exit"));
  }

  private clearScreen(): void {
    process.stdout.write("\x1b[2J\x1b[H");
  }
}
```

## 設定ファイル

### package.json

```json
{
  "name": "@cclog/typescript",
  "version": "1.0.0",
  "description": "TypeScript implementation of cclog",
  "main": "lib/index.js",
  "bin": {
    "cclog": "./bin/cclog"
  },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "prepare": "npm run build",
    "clean": "rm -rf lib dist"
  },
  "files": ["bin/", "lib/"],
  "engines": {
    "node": ">=14.0.0"
  },
  "dependencies": {
    "commander": "^9.4.0"
  },
  "devDependencies": {
    "typescript": "^4.9.0",
    "@types/node": "^18.0.0",
    "ts-node": "^10.9.0"
  },
  "license": "MIT"
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "./lib",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "lib", "dist"]
}
```

### bin/cclog

```bash
#!/usr/bin/env node
require('../lib/index.js');
```

## 利点

### 開発体験

- **型安全性**: コンパイル時エラー検出
- **IntelliSense**: 高度なエディタ支援
- **リファクタリング**: 安全な大規模変更

### 保守性

- **明確なインターフェース**: 型定義による仕様の明文化
- **バグの早期発見**: 型チェックによる実行時エラーの削減
- **ドキュメント**: 型定義が自動的にドキュメントとして機能

### 拡張性

- **モジュラー設計**: 型による明確な境界
- **プラグインシステム**: 型安全なプラグイン API
- **設定システム**: 型付き設定オブジェクト

この TypeScript 実装により、cclog は高い品質と保守性を持つ本格的な CLI ツールとして発展できます。
