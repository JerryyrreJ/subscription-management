type ScopedNotificationSettingsQuery<T> = {
 eq: (column: string, value: string) => T
}

export const scopeNotificationSettingsQueryToUser = <T extends ScopedNotificationSettingsQuery<T>>(query: T, userId: string): T =>
 query.eq('user_id', userId)
