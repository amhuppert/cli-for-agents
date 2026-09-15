import type { ReadHandler } from "cli-for-agents";
import type { doctorSpec, errors } from "./commands.js";
const handler: ReadHandler<typeof doctorSpec, never, typeof errors.definitions> = {
  run: async () => { throw new Error("Example doctor is a stub"); },
};
export default handler;
