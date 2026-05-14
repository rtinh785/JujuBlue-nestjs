export const FOLLOW_MESSAGE = {
  FOLLOW_OK: 'follow user successfully',
  UNFOLLOW_OK: 'unfollow user successfully',
} as const;

export const FOLLOW_ERROR = {
  MISSING_FOLLOWING_USER_ID: 'Missing followingUserId',
  CANNOT_FOLLOW_YOURSELF: 'You cannot follow yourself',
} as const;

export const FOLLOW_SUGGESTION = {
  LIMIT: 5,
} as const;
