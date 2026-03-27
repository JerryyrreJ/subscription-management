type ScopedCategoryQuery<T> = {
 eq: (column: string, value: string) => T
}

export const scopeCategoryQueryToUser = <T extends ScopedCategoryQuery<T>>(query: T, userId: string): T =>
 query.eq('user_id', userId)

export const scopeCategoryQueryToUserAndId = <T extends ScopedCategoryQuery<T>>(
 query: T,
 userId: string,
 categoryId: string
): T => scopeCategoryQueryToUser(query, userId).eq('category_id', categoryId)
