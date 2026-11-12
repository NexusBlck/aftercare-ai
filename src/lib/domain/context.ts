/** Injected clock + ID generator so domain functions stay pure and testable. */
export interface DomainContext {
  now: string;
  newId: () => string;
}

export function defaultContext(): DomainContext {
  return { now: new Date().toISOString(), newId: () => crypto.randomUUID() };
}
