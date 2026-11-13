import { handleRequest } from './handlers';
import type { CoreRequest } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<CoreRequest>) => {
  scope.postMessage(handleRequest(event.data));
});
