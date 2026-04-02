export type ScopedTaskToken = symbol;

export const createScopedTaskGate = <TScope extends string>() => {
 const latestTokenByScope = new Map<TScope, ScopedTaskToken>();

 return {
  claim(scope: TScope): ScopedTaskToken {
   const token = Symbol(scope);
   latestTokenByScope.set(scope, token);
   return token;
  },

  isCurrent(scope: TScope, token: ScopedTaskToken): boolean {
   return latestTokenByScope.get(scope) === token;
  },

  release(scope: TScope, token: ScopedTaskToken): void {
   if (this.isCurrent(scope, token)) {
    latestTokenByScope.delete(scope);
   }
  }
 };
};
