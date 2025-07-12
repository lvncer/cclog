import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionParser } from "./session-parser";
import { Project } from "../types/project";
import { SessionSummary } from "../types/session";

export class ProjectManager {
  private readonly claudeDir: string;

  constructor() {
    this.claudeDir = path.join(os.homedir(), ".claude", "projects");
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
          // 存在するパスを探す
          const existingPath = this.findExistingPath(entry);
          const decodedPath = existingPath || this.decodeProjectPath(entry);

          const lastActivity = Math.max(
            ...sessions.map((s) => s.modificationTime.getTime())
          );

          projects.push({
            encodedName: entry,
            path: decodedPath,
            sessionCount: sessions.length,
            lastActivity: new Date(lastActivity),
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
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

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
    return projectPath.replace(/[/.]/g, "-");
  }

  private decodeProjectPath(encoded: string): string {
    // Claudeのエンコード仕様:
    // - 先頭の/は-に変換
    // - パス区切り文字/は-に変換
    // - ディレクトリ名に含まれる-はそのまま保持
    // 例: /Users/lvncer/Downloads/cclog-npm → -Users-lvncer-Downloads-cclog-npm

    if (!encoded.startsWith("-")) {
      return encoded;
    }

    // 先頭-を除去
    const pathBody = encoded.slice(1);

    // 基本的なデコード: 全ての-を/に変換
    return "/" + pathBody.replace(/-/g, "/");
  }

  private findExistingPath(encoded: string): string | null {
    if (!encoded.startsWith("-")) {
      return fs.existsSync(encoded) ? encoded : null;
    }

    const pathBody = encoded.slice(1);
    const segments = pathBody.split("-");

    // パターンA: 連結パターンをすべて試す
    if (segments.length >= 3) {
      const userSegment = segments[0];
      const homeSegment = segments[1];
      const remainingSegments = segments.slice(2);
      const allPatterns = this.generateJoinPatterns(remainingSegments);
      for (const pattern of allPatterns) {
        const testPath = `/${userSegment}/${homeSegment}/${pattern}`;
        if (fs.existsSync(testPath)) {
          return testPath;
        }
      }
    }

    // パターン0: 最初の2つはパス区切り、残りは-で結合（Downloads/cclog-npm など）
    if (segments.length >= 3) {
      const userSegment = segments[0];
      const homeSegment = segments[1];
      const remainingSegments = segments.slice(2);
      const pattern0 = `/${userSegment}/${homeSegment}/${remainingSegments.join(
        "-"
      )}`;
      if (fs.existsSync(pattern0)) {
        return pattern0;
      }
    }

    // パターン1: 最初の2つはパス区切り、残りは/で結合
    if (segments.length >= 3) {
      const userSegment = segments[0];
      const homeSegment = segments[1];
      const remainingSegments = segments.slice(2);
      const pattern1 = `/${userSegment}/${homeSegment}/${remainingSegments.join(
        "/"
      )}`;
      if (fs.existsSync(pattern1)) {
        return pattern1;
      }
    }

    // パターン2: よくあるディレクトリ名パターンを試す
    if (segments.length >= 3) {
      const userSegment = segments[0];
      const homeSegment = segments[1];
      const remainingSegments = segments.slice(2);
      const commonPatterns = [
        remainingSegments.slice(0, -1).join("/") +
          "/" +
          remainingSegments.slice(-1)[0], // 最後以外を/で結合
      ];
      for (const pattern of commonPatterns) {
        const testPath = `/${userSegment}/${homeSegment}/${pattern}`;
        if (fs.existsSync(testPath)) {
          return testPath;
        }
      }
    }

    // パターン3: 残りのセグメントを個別に-と/で試す
    if (segments.length >= 3) {
      const userSegment = segments[0];
      const homeSegment = segments[1];
      const remainingSegments = segments.slice(2);
      const processedSegments = remainingSegments.map((segment) => {
        const patterns = [segment, segment.replace(/-/g, "/")];
        for (const pattern of patterns) {
          if (fs.existsSync(`/${userSegment}/${homeSegment}/${pattern}`)) {
            return pattern;
          }
        }
        return segment;
      });
      const pattern3 = `/${userSegment}/${homeSegment}/${processedSegments.join(
        "/"
      )}`;
      if (fs.existsSync(pattern3)) {
        return pattern3;
      }
    }

    // パターン4: 全ての-を/に変換（最後に試す）
    const pattern4 = "/" + pathBody.replace(/-/g, "/");
    if (fs.existsSync(pattern4)) {
      return pattern4;
    }

    // パターン5: より詳細な組み合わせテスト
    if (segments.length >= 3) {
      const userSegment = segments[0];
      const homeSegment = segments[1];
      const remainingSegments = segments.slice(2);

      // 各セグメントに対して複数のパターンを試す
      const segmentPatterns = remainingSegments
        .map((segment) => {
          const patterns: string[] = [];
          // 元のセグメント
          patterns.push(segment);
          // -を/に変換したパターン
          if (segment.includes("-")) {
            patterns.push(segment.replace(/-/g, "/"));
          }
          // 最初の-を/に変換したパターン
          if (segment.includes("-")) {
            patterns.push(segment.replace("-", "/"));
          }
          return patterns;
        })
        .filter((patterns): patterns is string[] => patterns.length > 0);

      // セグメントの組み合わせパターンを生成
      const combinations = this.generateCombinations(segmentPatterns);

      for (const combination of combinations) {
        const testPath = `/${userSegment}/${homeSegment}/${combination.join(
          "/"
        )}`;
        if (fs.existsSync(testPath)) {
          return testPath;
        }
      }
    }

    // パターン6: 特定のディレクトリ名パターンを試す
    if (segments.length >= 3) {
      const userSegment = segments[0];
      const homeSegment = segments[1];
      const remainingSegments = segments.slice(2);

      // cclog-npm のようなパターンを特別に処理
      const lastSegment = remainingSegments[remainingSegments.length - 1];
      const specialPatterns = [
        // 最後のセグメントが複数の-を含む場合の処理
        remainingSegments.slice(0, -1).join("/") +
          "/" +
          (lastSegment ? lastSegment.replace(/-/g, "/") : ""),
        // 最後のセグメントをそのまま保持
        remainingSegments.slice(0, -1).join("/") + "/" + (lastSegment || ""),
        // 全てのセグメントで-を/に変換
        remainingSegments.map((s) => s.replace(/-/g, "/")).join("/"),
      ];

      for (const pattern of specialPatterns) {
        const testPath = `/${userSegment}/${homeSegment}/${pattern}`;
        if (fs.existsSync(testPath)) {
          return testPath;
        }
      }
    }

    return null;
  }

  private generateCombinations(arrays: string[][]): string[][] {
    if (arrays.length === 0) return [[]];
    if (arrays.length === 1) {
      const firstArray = arrays[0];
      return firstArray ? firstArray.map((item) => [item]) : [[]];
    }

    const [first, ...rest] = arrays;
    if (!first) return [[]];

    const restCombinations = this.generateCombinations(rest);
    const result: string[][] = [];

    for (const item of first) {
      for (const combination of restCombinations) {
        result.push([item, ...combination]);
      }
    }

    return result;
  }

  // 連結パターン生成: 例 [a,b,c] → [a/b/c, a/b-c, a-b/c, a-b-c]
  private generateJoinPatterns(segments: string[]): string[] {
    const results: string[] = [];
    const n = segments.length;
    if (n === 0) return results;
    // 2^(n-1)通りの区切り方
    for (let mask = 0; mask < 1 << (n - 1); mask++) {
      let current = segments[0] ?? "";
      const pattern: string[] = [];
      for (let i = 1; i < n; i++) {
        const seg = segments[i] ?? "";
        if (mask & (1 << (i - 1))) {
          // -で連結
          current += "-" + seg;
        } else {
          // /で区切る
          pattern.push(current);
          current = seg;
        }
      }
      pattern.push(current);
      results.push(pattern.join("/"));
    }
    return results;
  }
}
