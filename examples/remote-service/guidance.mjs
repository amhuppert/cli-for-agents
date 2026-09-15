import { evaluateGuidance, decodeEvaluatedGuidance } from 'cli-for-agents/guidance';
export default async ({ command, app }) => app?.guidance
  ? decodeEvaluatedGuidance(app.guidance)
  : evaluateGuidance({ command, authority: 'local', state: {} });
