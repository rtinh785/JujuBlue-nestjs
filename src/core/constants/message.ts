export const AUTH = {
  REGISTER_OK: 'successfully registered',
  LOGIN_OK: 'successfully logged in',
  RESET_PASSWORD_OK: 'password reset email sent',
};

export const ERROR = {
  MISSING_ACCESS_TOKEN: 'Missing access token',
  MISSING_FILE: 'Missing file',
  MISSING_POST_ID: 'Missing post id',
  POST_NOT_FOUND: 'Post not found',
};

export const POST = {
  MISSING_CONTENT_OR_MEDIA: 'Post must have content or media',
  INVALID_MEDIA_FILE_TYPE: 'Only image or video files are allowed',

  // Like
  LIKE_SUCCESS: 'Post liked successfully',
  ALREADY_LIKED: 'Post already liked',
  UNLIKE_SUCCESS: 'Post unliked successfully',
  NOT_LIKED_YET: 'Post has not been liked yet',

  // Bookmark
  BOOKMARK_SUCCESS: 'Post bookmarked successfully',
  ALREADY_BOOKMARKED: 'Post already bookmarked',
  UNBOOKMARK_SUCCESS: 'Post unbookmarked successfully',
  NOT_BOOKMARKED_YET: 'Post has not been bookmarked yet',
};
