export const colors = {
  cyan: (text: string): string => `\x1b[36m${text}\x1b[0m`,
  white: (text: string): string => `\x1b[37m${text}\x1b[0m`,
  gray: (text: string): string => `\x1b[90m${text}\x1b[0m`,
  green: (text: string): string => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string): string => `\x1b[33m${text}\x1b[0m`,
  red: (text: string): string => `\x1b[31m${text}\x1b[0m`,
  highlight: (text: string): string => `\x1b[7m${text}\x1b[0m`,
  info: (text: string): string => `\x1b[90m${text}\x1b[0m`,
  error: (text: string): string => `\x1b[31m${text}\x1b[0m`,
  success: (text: string): string => `\x1b[32m${text}\x1b[0m`,
  reset: "\x1b[0m",
};
