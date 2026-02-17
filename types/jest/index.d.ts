declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function beforeEach(fn: () => void | Promise<void>): void;
declare function afterEach(fn: () => void | Promise<void>): void;

declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
  toBeDefined: () => void;
  toBeTruthy: () => void;
  toBeFalsy: () => void;
};

declare const jest: {
  fn: <T extends (...args: never[]) => unknown>(impl?: T) => T;
  spyOn: <T extends object, K extends keyof T>(obj: T, method: K) => unknown;
  clearAllMocks: () => void;
  resetAllMocks: () => void;
  restoreAllMocks: () => void;
};
