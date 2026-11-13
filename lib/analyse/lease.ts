import { AsyncLocalStorage } from "node:async_hooks";

const current = new AsyncLocalStorage<string>();

export class LeaseLost extends Error {
  constructor() {
    super("analysis lease lost");
    this.name = "LeaseLost";
  }
}

export function leaseToken(): string | null {
  return current.getStore() ?? null;
}

export function withLease<T>(token: string, work: () => Promise<T>): Promise<T> {
  return current.run(token, work);
}
