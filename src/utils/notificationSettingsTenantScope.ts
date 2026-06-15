type ScopedNotificationSettingsQuery = {
 eq: (column: string, value: string) => unknown
}

export const scopeNotificationSettingsQueryToUser = <T extends ScopedNotificationSettingsQuery>(query: T, userId: string): T =>
 query.eq('user_id', userId) as T
