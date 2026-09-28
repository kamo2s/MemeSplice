export const WORKER_REQUEST_TIMEOUT_MS=480000;
export function dispatchPolicy(concurrency){
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>100)throw new Error('Shared worker concurrency must be an integer from 1 to 100.');
  // Idle polling only; eligible jobs fill free slots without start spacing.
  return {idlePollMs:1000,maxInFlight:concurrency};
}
