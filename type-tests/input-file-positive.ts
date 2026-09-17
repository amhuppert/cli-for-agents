import type { HandlerContext } from "cli-for-agents";
import type { InputFileSource, PostOperationContext } from "cli-for-agents/runtime";

declare function accepts<T>(value: T): void;
declare const handler: HandlerContext<{ readonly path: "inspect"; readonly summary: "Inspect"; readonly description: "Inspect files"; readonly requires: "none"; readonly effects: "read"; readonly args: readonly []; readonly flags: {} }>;
declare const post: PostOperationContext<{}>;
accepts<readonly InputFileSource[]>(handler.inputFiles);
accepts<readonly InputFileSource[]>(post.inputFiles);
for (const source of post.inputFiles) {
  accepts<"payload" | "argument" | "flag" | "global">(source.kind);
  accepts<string>(source.name);
  accepts<string>(source.path);
}
