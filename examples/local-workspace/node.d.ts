/** Application-owned filesystem capability; the public kernel Host stays unchanged. */
declare module 'node:fs/promises' {
  export function mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
}
