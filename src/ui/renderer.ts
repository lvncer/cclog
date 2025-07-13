import { SessionSummary } from "../types/session";
import { Project } from "../types/project";
import { colors } from "./colors";

export function renderSessionList(session: SessionSummary): string {
  // Format date with zero-padding (YYYY/MM/DD HH:MM:SS)
  const date = session.startTimestamp;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const startTime = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;

  // Format message count to fixed width (8 characters) - left aligned
  const msgStr = session.messageCount.toString();
  const messageCount = msgStr.padEnd(8);

  // Truncate long messages
  let message = session.firstUserMessage;
  if (message.length > 60) {
    message = message.substring(0, 57) + "...";
  }

  return `${startTime}  ${messageCount}  ${message}`;
}

export function renderProjectList(project: Project): string {
  const lastActive = formatRelativeTime(project.lastActivity);
  const sessionStr = project.sessionCount.toString();
  const sessionCount =
    sessionStr.length >= 8 ? sessionStr : sessionStr.padEnd(8);

  // Truncate long paths
  let path = project.path;
  if (path.length > 80) {
    path = "..." + path.substring(path.length - 77);
  }

  return `${lastActive.padEnd(12)} ${sessionCount}  ${path}`;
}

export function renderSessionInfo(session: SessionSummary): string {
  const lines = [
    `Session:    ${session.sessionId}`,
    `Messages:   ${session.messageCount}`,
    `Started:    ${session.startTimestamp.toLocaleString()}`,
  ];

  if (
    session.lastTimestamp &&
    session.lastTimestamp !== session.startTimestamp
  ) {
    lines.push(`Finished:   ${session.lastTimestamp.toLocaleString()}`);
    const duration = Math.floor(
      (session.lastTimestamp.getTime() - session.startTimestamp.getTime()) /
        1000
    );
    lines.push(`Duration:   ${formatDuration(duration)}`);
  }

  if (session.matchedSummaries && session.matchedSummaries.length > 0) {
    lines.push("");
    lines.push("Topics:");
    session.matchedSummaries.slice(0, 5).forEach((summary) => {
      lines.push(`  • ${summary}`);
    });
  }

  // Add conversation preview if available
  if (session.previewMessages && session.previewMessages.length > 0) {
    lines.push("");
    lines.push("Preview:");
    session.previewMessages.forEach((message) => {
      const typeLabel = message.type === "user" ? "User: " : "Assistant: ";
      const content =
        message.content.length > 60
          ? message.content.substring(0, 57) + "..."
          : message.content;
      lines.push(`  ${typeLabel}${content}`);
    });
  }

  return lines.join("\n");
}

export function renderSessionMessage(
  type: "user" | "assistant",
  timestamp: string,
  content: string,
  isToolUse: boolean = false
): string {
  const typeLabel = type === "user" ? "User      " : "Assistant ";
  const colorFn = isToolUse
    ? colors.gray
    : type === "user"
    ? colors.cyan
    : colors.white;

  return colorFn(`${typeLabel}${timestamp}  ${content}`);
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (seconds < 86400) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(seconds / 86400);
  const remainingHours = Math.floor((seconds % 86400) / 3600);

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}
