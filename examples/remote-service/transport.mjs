import { errors } from './commands.mjs';

// Application-owned transport is evaluated only after local input validation.
export async function acquire({ globals, signal }) {
  const app = { globals, async request(path, body) {
    const response = await fetch(new URL(path, globals.server), {
      method: body === undefined ? 'GET' : 'POST', signal,
      headers: { authorization: `Bearer ${globals.token ?? ''}`, 'x-workspace': globals.workspace, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 401) throw Object.assign(new Error('Credential rejected'), { code: 'UNAUTHORIZED' });
    if (!response.ok) throw Object.assign(new Error('Request failed'), { code: 'NOT_FOUND' });
    return (await response.json()).data;
  } };
  return { ok: true, app };
}
export function failure(error, continuation) {
  return { ok: false, error: errors.error(error.code === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'UNAVAILABLE', {
    message: error.code === 'UNAUTHORIZED' ? 'Service credential rejected.' : 'Service request was not acknowledged.',
    ...(continuation ? { continuation } : {}),
  }) };
}
