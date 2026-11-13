import { describe, expect, it } from 'vitest';
import { handleRequest } from './handlers';
import { PROTOCOL_VERSION, type CoreRequest } from './protocol';

describe('handleRequest', () => {
  it('answers the handshake with the protocol version', () => {
    expect(handleRequest({ id: 1, method: 'handshake', params: null })).toEqual({
      id: 1,
      ok: true,
      result: { protocolVersion: PROTOCOL_VERSION },
    });
  });

  it('echoes ping payloads and keeps the request id', () => {
    expect(handleRequest({ id: 42, method: 'ping', params: { payload: 7 } })).toEqual({
      id: 42,
      ok: true,
      result: { payload: 7 },
    });
  });

  it('returns an error response for unknown methods instead of throwing', () => {
    const bogus = { id: 3, method: 'toString', params: null } as unknown as CoreRequest;
    const response = handleRequest(bogus);
    expect(response.ok).toBe(false);
    expect(response.id).toBe(3);
  });

  it('runs a simulation through the protocol', () => {
    const doc = { parts: [], wires: [] };
    const loaded = handleRequest({ id: 5, method: 'sim.load', params: { doc, inputs: {}, burned: [], firmware: {} } });
    expect(loaded.ok).toBe(true);
    const advanced = handleRequest({ id: 6, method: 'sim.advance', params: { dt: 0.01, budgetMs: 100 } });
    expect(advanced).toMatchObject({ ok: true, result: { time: 0.01, converged: true } });
    expect(handleRequest({ id: 7, method: 'sim.stop', params: null }).ok).toBe(true);
    // Advancing without a running simulation is an error, not a crash.
    expect(handleRequest({ id: 8, method: 'sim.advance', params: { dt: 0.01, budgetMs: 100 } }).ok).toBe(false);
  });

  it('returns an error response when a handler fails', () => {
    const malformed = { id: 4, method: 'ping', params: null } as unknown as CoreRequest;
    expect(handleRequest(malformed).ok).toBe(false);
  });
});
