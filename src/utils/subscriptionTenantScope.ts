type ScopedSubscriptionQuery = {
 eq: (column: string, value: string) => unknown
}

export const scopeSubscriptionQueryToUser = <T extends ScopedSubscriptionQuery>(query: T, userId: string): T =>
 query.eq('user_id', userId) as T

export const scopeSubscriptionQueryToUserAndId = <T extends ScopedSubscriptionQuery>(
 query: T,
 userId: string,
 subscriptionId: string
): T => scopeSubscriptionQueryToUser(query, userId).eq('id', subscriptionId) as T
