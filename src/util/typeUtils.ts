export type OmitVoidReturns<T extends object> = {
  [K in keyof T as T[K] extends (...args: any[]) => infer R
    ? R extends void
      ? never
      : K
    : K]: T[K];
};
