import { bytes, invocation } from 'cli-for-agents';
import { createCli, type Cli, type CliOptions } from 'cli-for-agents/runtime';
import type { Workspace } from './app.js';
import { commands, doctor, family, groups } from './commands.js';
type Guidance = CliOptions<{ workspace: Workspace }, typeof family.errors.definitions, {}>['guidance'];
export function createWorkspaceCli(guidance?: Guidance): Cli<{ workspace: Workspace }> {
return createCli({ name: 'workspace', version: '1.0.0', family, commands, groups,
  doctor: invocation(doctor, {}), ...(guidance ? { guidance } : {}),
  contexts: { workspace: async input => {
    try { return { ok: true, app: await (await import('./store.js')).acquire(input) }; }
    catch { return { ok: false, error: family.errors.error('WORKSPACE_UNAVAILABLE', { message: 'Workspace cannot be opened.' }) }; }
  } },
  output: { maxBytes: bytes(8192), artifacts: { resolve: input => {
    const root = input.requires === 'workspace' ? input.app.root : input.env['WORKSPACE_HOME'];
    return { directory: input.env['WORKSPACE_ARTIFACTS'] ?? (input.requires === 'workspace' ? `${root}/artifacts` : input.env['TMPDIR'] ?? '/tmp'), forbiddenRoots: root ? [`${root}/data`] : [] };
  } } },
});

}
export const cli = createWorkspaceCli();
