type ScopedCategoryQuery = {
 eq: (column: string, value: string) => unknown
}

export const scopeCategoryQueryToUser = <T extends ScopedCategoryQuery>(query: T, userId: string): T =>
 query.eq('user_id', userId) as T

export const scopeCategoryQueryToUserAndId = <T extends ScopedCategoryQuery>(
 query: T,
 userId: string,
 categoryId: string
): T => scopeCategoryQueryToUser(query, userId).eq('category_id', categoryId) as T
