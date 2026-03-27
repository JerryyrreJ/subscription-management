type ScopedSubscriptionQuery<T> = {
 eq: (column: string, value: string) => T
}

export const scopeSubscriptionQueryToUser = <T extends ScopedSubscriptionQuery<T>>(query: T, userId: string): T =>
 query.eq('user_id', userId)

export const scopeSubscriptionQueryToUserAndId = <T extends ScopedSubscriptionQuery<T>>(
 query: T,
 userId: string,
 subscriptionId: string
): T => scopeSubscriptionQueryToUser(query, userId).eq('id', subscriptionId)
