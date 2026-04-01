export const GUEST_DATA_SCOPE = 'guest' as const;

export type DataScope = typeof GUEST_DATA_SCOPE | `user:${string}`;

let activeDataScope: DataScope = GUEST_DATA_SCOPE;

export const getUserDataScope = (userId: string): DataScope => `user:${userId}`;

export const getActiveDataScope = (): DataScope => activeDataScope;

export const setActiveDataScope = (scope: DataScope): void => {
 activeDataScope = scope;
};

export const resolveScopedStorageKey = (baseKey: string, scope: DataScope = getActiveDataScope()): string =>
 scope === GUEST_DATA_SCOPE ? baseKey : `${baseKey}:${scope}`;
