export const AUTH_TIMEOUT_MS = 8_000;

export class DeadlineError extends Error {
  constructor() {
    super("timeout");
    this.name = "DeadlineError";
  }
}

/** Reject a promise if it does not settle within ms. */
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
