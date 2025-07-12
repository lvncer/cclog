export interface SelectableItem<T = any> {
  display: string;
  searchText: string;
  value: T;
  action?: "view" | "path" | "resume";
}

export interface SelectorOptions {
  height?: number;
  headerLines?: number;
  preview?: (item: SelectableItem) => string;
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
