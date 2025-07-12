import * as readline from "readline";
import { SelectableItem, SelectorOptions } from "../types/ui";
import { colors } from "./colors";
import { spawn, execSync } from "child_process";

export class InteractiveSelector<T = any> {
  private items: SelectableItem<T>[];
  private filtered: SelectableItem<T>[];
  private selectedIndex = 0;
  private query = "";
  private headerLines = 0;

  constructor(
    items: SelectableItem<T>[],
    private readonly options: SelectorOptions = {}
  ) {
    this.items = items;
    this.filtered = [...items];
    this.headerLines = options.headerLines || 0;
    this.selectedIndex = this.headerLines; // Start after header lines
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
    if (!key) return;

    switch (key.name) {
      case "up":
        if (this.selectedIndex > this.headerLines) {
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
        const selectedItem = this.filtered[this.selectedIndex];
        if (selectedItem && this.selectedIndex >= this.headerLines) {
          resolve(selectedItem);
        } else {
          resolve(null);
        }
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

      case "v":
        if (key.ctrl) {
          // Ctrl-V: View session content (only for sessions, not projects)
          const selectedItem = this.filtered[this.selectedIndex];
          if (selectedItem && this.selectedIndex >= this.headerLines) {
            // Check if we're in projects view (items have path-like values)
            const isProjectsView = this.items.some(
              (item) =>
                item.value &&
                typeof item.value === "string" &&
                item.value.includes("/")
            );

            if (!isProjectsView) {
              cleanup();
              resolve({ ...selectedItem, action: "view" });
            }
            // For projects view, Ctrl-V does nothing (as per README)
          }
        }
        break;

      case "p":
        if (key.ctrl) {
          // Ctrl-P: Return file path
          const selectedItem = this.filtered[this.selectedIndex];
          if (selectedItem && this.selectedIndex >= this.headerLines) {
            cleanup();
            resolve({ ...selectedItem, action: "path" });
          }
        }
        break;

      case "r":
        if (key.ctrl) {
          // Ctrl-R: Resume session (実行)
          const selectedItem = this.filtered[this.selectedIndex];
          if (selectedItem && this.selectedIndex >= this.headerLines) {
            cleanup();
            const sessionId = String(selectedItem.value);

            // Check if claude command exists
            try {
              execSync("which claude", { stdio: "ignore" });
              const proc = spawn("claude", ["-r", sessionId], {
                stdio: "inherit",
              });
              proc.on("exit", (code: number | null) => process.exit(code ?? 0));
            } catch (error) {
              console.error(
                colors.error(
                  "Error: claude command not found. Please install claude CLI first."
                )
              );
              console.error(
                colors.info("Install with: npm install -g @anthropic-ai/claude")
              );
              process.exit(1);
            }
          }
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
    // Ensure selected index is not on header lines and within bounds
    const minIndex = this.headerLines;
    const maxIndex = Math.max(minIndex, this.filtered.length - 1);
    this.selectedIndex = Math.max(
      minIndex,
      Math.min(this.selectedIndex, maxIndex)
    );
  }

  private render(): void {
    this.clearScreen();

    // Show search query
    console.log(`> ${this.query}`);
    console.log("");

    // Show header lines (always show if they exist)
    if (this.options.headerLines && this.options.headerLines > 0) {
      const headerItems = this.items.slice(0, this.options.headerLines);
      headerItems.forEach((item) => {
        console.log(colors.info(item.display));
      });
    }

    // Show filtered items (skip header lines in display)
    const height = this.options.height || 20;
    const displayItems = this.filtered.slice(
      this.headerLines,
      this.headerLines + height
    );

    displayItems.forEach((item, index) => {
      const actualIndex = index + this.headerLines;
      const isSelected = actualIndex === this.selectedIndex;
      const prefix = isSelected ? "> " : "  ";
      const line = `${prefix}${item.display}`;

      if (isSelected) {
        console.log(colors.highlight(line));
      } else {
        console.log(line);
      }
    });

    // Show preview if available
    const selectedItem = this.filtered[this.selectedIndex];
    if (
      this.options.preview &&
      selectedItem &&
      this.selectedIndex >= this.headerLines
    ) {
      console.log("\n" + "─".repeat(80));
      console.log(this.options.preview(selectedItem));
    }

    // Show help with additional keybindings
    console.log(colors.info("\n↑↓: Navigate, Enter: Select, Ctrl+C: Exit"));
    if (this.selectedIndex >= this.headerLines) {
      // Check if we're in projects view (items have path-like values)
      const isProjectsView = this.items.some(
        (item) =>
          item.value &&
          typeof item.value === "string" &&
          item.value.includes("/")
      );

      if (isProjectsView) {
        console.log(colors.info("Ctrl+P: Path"));
      } else {
        console.log(colors.info("Ctrl+V: View, Ctrl+P: Path, Ctrl+R: Resume"));
      }
    }
  }

  private clearScreen(): void {
    process.stdout.write("\x1b[2J\x1b[H");
  }
}
