#!/usr/bin/env node

import { ProjectManager } from "./core/project-manager";
import { SessionParser } from "./core/session-parser";
import { InteractiveSelector } from "./ui/interactive-selector";
import {
  renderSessionList,
  renderProjectList,
  renderSessionInfo,
  renderSessionMessage,
} from "./ui/renderer";
import { colors } from "./ui/colors";
import { SelectableItem } from "./types/ui";
import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { SessionSummary } from "./types/session";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    if (command === "projects" || command === "p") {
      await showProjects();
    } else if (command === "view" || command === "v") {
      if (!args[1]) {
        console.error(colors.error("Usage: cclog view <session-file>"));
        process.exit(1);
      }
      await viewSession(args[1]);
    } else if (command === "info" || command === "i") {
      if (!args[1]) {
        console.error(colors.error("Usage: cclog info <session-file>"));
        process.exit(1);
      }
      await showSessionInfo(args[1]);
    } else if (
      command === "help" ||
      command === "h" ||
      command === "--help" ||
      command === "-h"
    ) {
      showHelp();
    } else {
      await showSessions();
    }
  } catch (error) {
    console.error(
      colors.error("Error:"),
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exit(1);
  }
}

async function showSessions(): Promise<void> {
  const projectManager = new ProjectManager();
  const sessions = await projectManager.getCurrentProjectSessions();

  if (sessions.length === 0) {
    console.log("No sessions found for this project");
    return;
  }

  // Create header items
  const headerItems: SelectableItem[] = [
    {
      display: "Claude Code Sessions for: " + process.cwd(),
      searchText: "",
      value: "",
    },
    {
      display: "↑↓: Navigate, Enter: Resume, Ctrl+C: Exit",
      searchText: "",
      value: "",
    },
    {
      display: "Ctrl+V: View, Ctrl+P: Show Paths\n",
      searchText: "",
      value: "",
    },
    {
      display: "CREATED             MESSAGES  FIRST_MESSAGE",
      searchText: "",
      value: "",
    },
  ];

  const sessionItems: SelectableItem[] = sessions.map((session) => ({
    display: renderSessionList(session),
    searchText: `${session.sessionId} ${session.firstUserMessage}`,
    value: session.sessionId,
  }));

  const allItems = [...headerItems, ...sessionItems];

  const selector = new InteractiveSelector(allItems, {
    height: 20,
    headerLines: 4,
    preview: (item) => {
      if (headerItems.includes(item)) return "";
      const session = sessions.find((s) => s.sessionId === item.value);
      return session ? renderSessionInfo(session) : "";
    },
  });

  let shouldContinue = true;
  while (shouldContinue) {
    const selected = await selector.show();
    if (selected && !headerItems.includes(selected)) {
      if (selected.action === "view") {
        // Ctrl-V: View session content
        const session = sessions.find((s) => s.sessionId === selected.value);
        if (session) {
          await viewSession(session.filePath);
          // After viewing, continue the loop to show the session list again
          continue;
        }
      } else if (selected.action === "path") {
        // Ctrl-P: Return file path
        const session = sessions.find((s) => s.sessionId === selected.value);
        if (session) {
          console.log(session.filePath);
        }
        shouldContinue = false;
      } else {
        // Enter: Resume session (claude -r)
        try {
          execSync("which claude", { stdio: "ignore" });
          execSync(`claude -r ${String(selected.value)}`, { stdio: "inherit" });
          process.exit(0);
        } catch (error) {
          console.error(
            colors.error(
              "Error: claude command not found. Please install claude CLI first."
            )
          );
          console.error(
            colors.info("Install with: npm install -g @anthropic-ai/claude")
          );
        }
        shouldContinue = false;
      }
    } else {
      shouldContinue = false;
    }
  }
}

async function showProjects(): Promise<void> {
  const projectManager = new ProjectManager();
  const projects = await projectManager.getAllProjects();

  if (projects.length === 0) {
    console.log("No Claude projects found");
    return;
  }

  // Create header items
  const headerItems: SelectableItem[] = [
    {
      display: "Claude Code Projects (sorted by recent activity)",
      searchText: "",
      value: "",
    },
    {
      display: "↑↓: Navigate, Enter: Change Directory, Ctrl+C: Exit",
      searchText: "",
      value: "",
    },
    {
      display:
        "Ctrl+P: Show Paths, Ctrl+S: Show Sessions, Ctrl+F: Get File Names\n",
      searchText: "",
      value: "",
    },
    {
      display: "LAST_ACTIVE  SESSIONS  PROJECT_PATH",
      searchText: "",
      value: "",
    },
  ];

  const projectItems: SelectableItem[] = projects.map((project) => {
    const exists = fs.existsSync(project.path);
    return {
      display: exists
        ? renderProjectList(project)
        : colors.error(renderProjectList(project) + " (NOT FOUND)"),
      searchText: project.path,
      value: project.path,
      exists,
    };
  });

  const allItems = [...headerItems, ...projectItems];

  const selector = new InteractiveSelector(allItems, {
    height: 15,
    headerLines: 4,
    preview: (item) => {
      if (headerItems.includes(item)) return "";
      return "";
    },
  });

  const selected = await selector.show();
  if (selected && !headerItems.includes(selected)) {
    if (!selected.exists) {
      console.error(colors.error("パスが存在しません: " + selected.value));
      return;
    }
    if (selected.action === "path") {
      // Ctrl-P: Return project path
      try {
        execSync("which claude", { stdio: "ignore" });
        execSync(`claude -r ${String(selected.value)}`, { stdio: "inherit" });
        process.exit(0);
      } catch (error) {
        console.error(
          colors.error(
            "Error: claude command not found. Please install claude CLI first."
          )
        );
        console.error(
          colors.info("Install with: npm install -g @anthropic-ai/claude")
        );
      }
    } else if (selected.action === "sessions") {
      // Ctrl-S: Show sessions for project
      await showProjectSessions(selected.value);
    } else if (selected.action === "files") {
      // Ctrl-F: Get session file names
      await showSessionFileNames(selected.value);
    } else {
      // Enter: Change to project directory
      try {
        // シェルコマンドとしてcdを実行し、新しいシェルを起動
        const proc = spawn(
          "sh",
          ["-c", `cd "${selected.value}" && exec $SHELL`],
          {
            stdio: "inherit",
            cwd: process.cwd(),
          }
        );
        proc.on("exit", (code: number | null) => process.exit(code ?? 0));
      } catch (error) {
        console.error(
          colors.error(`ディレクトリの変更に失敗しました: ${selected.value}`)
        );
        console.error(
          colors.error(error instanceof Error ? error.message : "Unknown error")
        );
      }
    }
  }
}

async function viewSession(filePath: string): Promise<void> {
  const parser = new SessionParser(filePath);
  const messages = await parser.parseForDisplay();

  if (messages.length === 0) {
    console.log("No messages found in session");
    return;
  }

  // Clear screen and show session content
  console.clear();
  console.log(colors.info("=== Session Content ==="));
  console.log(colors.info(`File: ${filePath}`));
  console.log("");

  for (const message of messages) {
    console.log(
      renderSessionMessage(
        message.type,
        message.timestamp,
        message.content,
        message.isToolUse
      )
    );
  }

  console.log("");
  console.log(colors.info("Press any key to return to session list..."));

  // Wait for user input before returning
  await new Promise<void>((resolve) => {
    const stdin = process.stdin;
    const originalRawMode = stdin.isRaw;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (data: Buffer) => {
      stdin.setRawMode(originalRawMode);
      stdin.pause();
      stdin.removeListener("data", onData);
      resolve();
    };

    stdin.on("data", onData);
  });
}

async function showSessionInfo(filePath: string): Promise<void> {
  const parser = new SessionParser(filePath);
  const session = await parser.parseMinimal();

  console.log(renderSessionInfo(session));
}

async function showProjectSessions(projectPath: string): Promise<void> {
  const projectManager = new ProjectManager();
  const projects = await projectManager.getAllProjects();
  const project = projects.find((p) => p.path === projectPath);

  if (!project) {
    console.error(colors.error("プロジェクトが見つかりません: " + projectPath));
    return;
  }

  // プロジェクトのセッション一覧を表示
  const claudeDir = path.join(process.env.HOME || "", ".claude", "projects");
  const projectDir = path.join(claudeDir, project.encodedName);

  if (!fs.existsSync(projectDir)) {
    console.error(
      colors.error("プロジェクトディレクトリが見つかりません: " + projectDir)
    );
    return;
  }

  const files = await fs.promises.readdir(projectDir);
  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

  if (jsonlFiles.length === 0) {
    console.log("このプロジェクトにはセッションがありません");
    return;
  }

  const sessions: SessionSummary[] = [];
  for (const file of jsonlFiles) {
    const filePath = path.join(projectDir, file);
    const parser = new SessionParser(filePath);
    try {
      const session = await parser.parseMinimal();
      sessions.push(session);
    } catch (e) {
      // Skip invalid files
    }
  }

  sessions.sort(
    (a, b) => b.modificationTime.getTime() - a.modificationTime.getTime()
  );

  console.log(colors.info(`\nプロジェクト: ${projectPath}`));
  console.log(colors.info(`セッション数: ${sessions.length}\n`));

  // セッション一覧を表示
  const headerItems: SelectableItem[] = [
    {
      display: "CREATED             MESSAGES  FIRST_MESSAGE",
      searchText: "",
      value: "",
    },
  ];

  const sessionItems: SelectableItem[] = sessions.map((session) => ({
    display: renderSessionList(session),
    searchText: `${session.sessionId} ${session.firstUserMessage}`,
    value: session.sessionId,
  }));

  const allItems = [...headerItems, ...sessionItems];

  const selector = new InteractiveSelector(allItems, {
    height: 20,
    headerLines: 1,
    preview: (item) => {
      if (headerItems.includes(item)) return "";
      const session = sessions.find((s) => s.sessionId === item.value);
      return session ? renderSessionInfo(session) : "";
    },
  });

  const selected = await selector.show();
  if (selected && !headerItems.includes(selected)) {
    if (selected.action === "view") {
      // Ctrl-V: View session content
      const session = sessions.find((s) => s.sessionId === selected.value);
      if (session) {
        await viewSession(session.filePath);
      }
    } else if (selected.action === "path") {
      // Ctrl-P: Return file path
      const session = sessions.find((s) => s.sessionId === selected.value);
      if (session) {
        console.log(session.filePath);
      }
    } else {
      // Enter: Resume session (claude -r)
      try {
        execSync("which claude", { stdio: "ignore" });
        execSync(`claude -r ${String(selected.value)}`, { stdio: "inherit" });
        process.exit(0);
      } catch (error) {
        console.error(
          colors.error(
            "Error: claude command not found. Please install claude CLI first."
          )
        );
        console.error(
          colors.info("Install with: npm install -g @anthropic-ai/claude")
        );
      }
    }
  }
}

async function showSessionFileNames(projectPath: string): Promise<void> {
  const projectManager = new ProjectManager();
  const projects = await projectManager.getAllProjects();
  const project = projects.find((p) => p.path === projectPath);

  if (!project) {
    console.error(colors.error("プロジェクトが見つかりません: " + projectPath));
    return;
  }

  // プロジェクトのセッションファイル名一覧を表示
  const claudeDir = path.join(process.env.HOME || "", ".claude", "projects");
  const projectDir = path.join(claudeDir, project.encodedName);

  if (!fs.existsSync(projectDir)) {
    console.error(
      colors.error("プロジェクトディレクトリが見つかりません: " + projectDir)
    );
    return;
  }

  const files = await fs.promises.readdir(projectDir);
  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

  if (jsonlFiles.length === 0) {
    console.log("このプロジェクトにはセッションがありません");
    return;
  }

  console.log(colors.info(`\nプロジェクト: ${projectPath}`));
  console.log(colors.info(`セッションファイル一覧:\n`));

  jsonlFiles.forEach((fileName, index) => {
    console.log(`${index + 1}. ${fileName}`);
  });

  console.log(
    colors.info(`\n合計: ${jsonlFiles.length}個のセッションファイル`)
  );
}

function showHelp(): void {
  console.log(`cclog - Browse Claude Code conversation history

Usage:
  cclog [options]          Browse sessions in current directory
  cclog projects           Browse all projects
  cclog view <session>     View session content
  cclog info <session>     Show session information
  cclog help               Show this help message

Options:
  projects, p              Browse all projects
  view, v                  View session content
  info, i                  Show session information
  help, h, --help, -h      Show help

Navigation:
  ↑↓ keys                  Navigate list
  Enter                    Select item
  Ctrl+C                   Exit
  Type text                Filter/search items

Session Actions:
  Enter                    Resume session (claude -r)
  Ctrl+V                   View session content
  Ctrl+P                   Return file path
  Ctrl+R                   Resume session with claude -r`);
}

// Handle uncaught errors
process.on("unhandledRejection", (reason, promise) => {
  console.error(
    colors.error("Unhandled Rejection at:"),
    promise,
    colors.error("reason:"),
    reason
  );
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error(colors.error("Uncaught Exception:"), error);
  process.exit(1);
});

main();
