import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionParser } from './session-parser';
import { Project } from '../types/project';
import { SessionSummary } from '../types/session';

export class ProjectManager {
  private readonly claudeDir: string;

  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude', 'projects');
  }

  async getCurrentProjectSessions(): Promise<SessionSummary[]> {
    const cwd = process.cwd();
    const encodedPath = this.encodeProjectPath(cwd);
    const projectDir = path.join(this.claudeDir, encodedPath);

    if (!fs.existsSync(projectDir)) {
      throw new Error(`No Claude logs found for this project: ${cwd}`);
    }

    return this.getSessionsFromDir(projectDir);
  }

  async getAllProjects(): Promise<Project[]> {
    if (!fs.existsSync(this.claudeDir)) {
      return [];
    }

    const projects: Project[] = [];
    const entries = await fs.promises.readdir(this.claudeDir);

    for (const entry of entries) {
      const projectPath = path.join(this.claudeDir, entry);
      const stat = await fs.promises.stat(projectPath);

      if (stat.isDirectory()) {
        const sessions = await this.getSessionsFromDir(projectPath);
        if (sessions.length > 0) {
          const decodedPath = this.decodeProjectPath(entry);
          const lastActivity = Math.max(
            ...sessions.map((s) => s.modificationTime.getTime())
          );

          projects.push({
            encodedName: entry,
            path: decodedPath,
            sessionCount: sessions.length,
            lastActivity: new Date(lastActivity)
          });
        }
      }
    }

    return projects.sort(
      (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
    );
  }

  private async getSessionsFromDir(dirPath: string): Promise<SessionSummary[]> {
    const files = await fs.promises.readdir(dirPath);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
    
    const sessions: SessionSummary[] = [];
    
    for (const file of jsonlFiles) {
      const filePath = path.join(dirPath, file);
      const parser = new SessionParser(filePath);
      
      try {
        const session = await parser.parseMinimal();
        sessions.push(session);
      } catch (e) {
        // Skip invalid files
      }
    }

    return sessions.sort(
      (a, b) => b.modificationTime.getTime() - a.modificationTime.getTime()
    );
  }

  private encodeProjectPath(projectPath: string): string {
    // Claude's encoding: "/" -> "-", "." -> "-"
    return projectPath.replace(/[/.]/g, '-');
  }

  private decodeProjectPath(encoded: string): string {
    // Simple decode: replace leading - and convert - to /
    if (encoded.startsWith('-')) {
      return encoded.substring(1).replace(/-/g, '/');
    }
    return encoded.replace(/-/g, '/');
  }
}