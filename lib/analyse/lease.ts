import { AsyncLocalStorage } from "node:async_hooks";

const current = new AsyncLocalStorage<string>();

export class LeaseLost extends Error {
  constructor() {
    super("analysis lease lost");
    this.name = "LeaseLost";
  }
}

/** Return the lease token for the current async context, if any. */
export function leaseToken(): string | null {
  return current.getStore() ?? null;
}

/** Run work with a lease token stored in async-local storage. */
export function withLease<T>(token: string, work: () => Promise<T>): Promise<T> {
  return current.run(token, work);
}
