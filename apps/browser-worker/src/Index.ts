/**
 * Reserved boundary for a future protected browser runtime.
 * Do not add generic evaluate(), shell execution, credential reads, or owner APIs.
 */
export function capabilities() {
  return { mode: 'scaffold', protectedExecution: false, realCredentials: false } as const;
}

export function execute(): never {
  throw new Error('Protected browser runtime is not implemented');
}
