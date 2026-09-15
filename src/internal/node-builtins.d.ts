/** Minimal private Node surface; no ambient Node types leak into the public API. */
declare module "node:fs" {
  export interface Readable {
    readonly readableEnded: boolean;
    readonly destroyed: boolean;
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "end" | "close", listener: () => void): this;
    removeListener(event: "data", listener: (chunk: Uint8Array) => void): this;
    removeListener(event: "error", listener: (error: Error) => void): this;
    removeListener(event: "end" | "close", listener: () => void): this;
    pause(): this;
    resume(): this;
    destroy(): this;
  }
  export const constants: { readonly O_RDONLY: number; readonly O_NONBLOCK: number };
}
declare module "node:fs/promises" {
  interface Stats { readonly mode: number; isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }
  interface FileHandle {
    stat(): Promise<Stats>;
    createReadStream(options: { highWaterMark: number }): import("node:fs").Readable;
    writeFile(data: Uint8Array): Promise<void>;
    chmod(mode: number): Promise<void>;
    sync(): Promise<void>;
    close(): Promise<void>;
  }
  export function open(path: string, flags: string | number, mode?: number): Promise<FileHandle>;
  export function readdir(path: string): Promise<string[]>;
  export function unlink(path: string): Promise<void>;
  export function lstat(path: string): Promise<Stats>;
  export function stat(path: string): Promise<Stats>;
  export function readlink(path: string): Promise<string>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function rename(existing: string, path: string): Promise<void>;
  export function link(existing: string, path: string): Promise<void>;
  export function rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
}
declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
  export function parse(path: string): { root: string };
  export const sep: string;
}
declare module "node:process" {
  export const stdin: import("node:fs").Readable;
  export const argv: string[];
  export const env: Record<string, string | undefined>;
  export const stdout: import("node:stream").Writable;
  export const stderr: import("node:stream").Writable;
  export function exit(code: number): never;
  export function cwd(): string;
  const process: {
    readonly argv: typeof argv; readonly env: typeof env;
    readonly stdout: typeof stdout; readonly stderr: typeof stderr;
    readonly exit: typeof exit;
    on(event: "SIGINT" | "SIGTERM", listener: () => void): void;
    removeListener(event: "SIGINT" | "SIGTERM", listener: () => void): void;
  };
  export default process;
}
declare module "node:stream" {
  export interface Writable {
    readonly destroyed: boolean;
    write(text: string, callback: (error?: Error | null) => void): boolean;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "drain" | "close", listener: () => void): this;
    removeListener(event: "error", listener: (error: Error) => void): this;
    removeListener(event: "drain" | "close", listener: () => void): this;
  }
}
declare module "node:module" {
  export const enableCompileCache: undefined | (() => unknown);
}
declare module "node:crypto" {
  export function createHash(algorithm: "sha256"): {
    update(data: Uint8Array): { digest(encoding: "hex"): string };
  };
}
