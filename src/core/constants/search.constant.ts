export const SEARCH_QUERY = {
  POSTS_LIMIT: 10,
  USERS_LIMIT: 10,
} as const;

export const SEARCH_TYPE = {
  ALL: 'all',
  POSTS: 'posts',
  USERS: 'users',
} as const;

export const SEARCH_SORT = {
  LATEST: 'latest',
  OLDEST: 'oldest',
} as const;
