import {
  PROTOCOL_VERSION,
  type CoreMethod,
  type CoreParams,
  type CoreRequest,
  type CoreResponse,
  type CoreResult,
} from './protocol';
import { SimSession } from './sim/session';

type Handlers = { [M in CoreMethod]: (params: CoreParams<M>) => CoreResult<M> };

let session: SimSession | null = null;

function requireSession(): SimSession {
  if (!session) throw new Error('No simulation is running');
  return session;
}

const handlers: Handlers = {
  handshake: () => ({ protocolVersion: PROTOCOL_VERSION }),
  ping: ({ payload }) => ({ payload }),
  'sim.load': ({ doc, inputs, burned, firmware }) => {
    session = new SimSession();
    session.load(doc, inputs, burned, firmware);
    return session.snapshot();
  },
  'sim.update': ({ doc, inputs }) => {
    requireSession().update(doc, inputs);
    return null;
  },
  'sim.advance': ({ dt, budgetMs }) => requireSession().advance(dt, budgetMs),
  'sim.repair': ({ partIds }) => {
    requireSession().repair(partIds);
    return null;
  },
  'sim.serialWrite': ({ partId, text }) => {
    requireSession().serialWrite(partId, text);
    return null;
  },
  'sim.stop': () => {
    session = null;
    return null;
  },
};

/**
 * Dispatches one request. Pure and worker-agnostic so it can be unit tested
 * without spawning a worker. Never throws: failures become error responses.
 */
export function handleRequest(request: CoreRequest): CoreResponse {
  try {
    if (!Object.hasOwn(handlers, request.method)) {
      throw new Error(`Unknown core method: ${String(request.method)}`);
    }
    const handler = handlers[request.method] as unknown as (
      params: unknown,
    ) => CoreResult<CoreMethod>;
    return { id: request.id, ok: true, result: handler(request.params) };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
