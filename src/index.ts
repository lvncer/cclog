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
import { spawn } from "child_process";

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
      display: "Enter: Return session ID, Ctrl+C: Exit",
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
    headerLines: 3,
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
      // Enter: Return session ID
      console.log(selected.value);
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
    { display: "Enter: Show project path", searchText: "", value: "" },
    {
      display: "LAST_ACTIVE  SESSIONS  PROJECT_PATH",
      searchText: "",
      value: "",
    },
  ];

  const projectItems: SelectableItem[] = projects.map((project) => ({
    display: renderProjectList(project),
    searchText: project.path,
    value: project.path,
  }));

  const allItems = [...headerItems, ...projectItems];

  const selector = new InteractiveSelector(allItems, {
    height: 15,
    headerLines: 3,
    preview: (item) => {
      if (headerItems.includes(item)) return "";
      return `cd ${item.value}`;
    },
  });

  const selected = await selector.show();
  if (selected && !headerItems.includes(selected)) {
    if (selected.action === "view") {
      // Ctrl-V: Change to project directory and show sessions
      const proc = spawn('sh', ['-c', `cd "${selected.value}" && cclog`], { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      proc.on('exit', (code: number | null) => process.exit(code ?? 0));
    } else if (selected.action === "path") {
      // Ctrl-P: Return project path
      console.log(selected.value);
    } else {
      // Enter: Show project path
      console.log(`cd ${selected.value}`);
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
}

async function showSessionInfo(filePath: string): Promise<void> {
  const parser = new SessionParser(filePath);
  const session = await parser.parseMinimal();

  console.log(renderSessionInfo(session));
}

function showHelp(): void {
  console.log(`cclog - Browse Claude Code conversation history

Usage:
  cclog [options]           Browse sessions in current directory
  cclog projects            Browse all projects
  cclog view <session>      View session content
  cclog info <session>      Show session information
  cclog help               Show this help message

Options:
  projects, p                       Browse all projects
  view, v                          View session content
  info, i                          Show session information
  help, h, --help, -h              Show help

Navigation:
  ↑↓ keys                          Navigate list
  Enter                            Select item
  Ctrl+C                           Exit
  Type text                        Filter/search items

Session Actions:
  Enter                            Return session ID
  Ctrl+V                           View session content
  Ctrl+P                           Return file path
  Ctrl+R                           Resume session with claude -r`);
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
