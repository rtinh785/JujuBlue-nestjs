export const POST_MESSAGE = {
  UPDATED: 'Post updated successfully',
  DELETED: 'Post deleted successfully',
  SHARED: 'Post shared successfully',
  LIKE_SUCCESS: 'Post liked successfully',
  UNLIKE_SUCCESS: 'Post unliked successfully',
  BOOKMARK_SUCCESS: 'Post bookmarked successfully',
  UNBOOKMARK_SUCCESS: 'Post unbookmarked successfully',
} as const;

export const POST_ERROR = {
  NOTHING_TO_UPDATE: 'Nothing to update',
  NOT_FOUND: 'Post not found',
  UPDATE_FORBIDDEN: 'You are not allowed to update this post',
  DELETE_FORBIDDEN: 'You are not allowed to delete this post',
  UPDATE_FAILED: 'Failed to update post',

  ROOT_POST_NOT_FOUND: 'Root post not found',
  PARENT_COMMENT_NOT_FOUND: 'Parent comment not found',
  PARENT_COMMENT_NOT_BELONG_TO_POST:
    'Parent comment does not belong to this post',
  INVALID_PARENT_COMMENT_DEPTH: 'Invalid parent comment depth',

  POST_AUTHOR_NOT_FOUND: 'Post author not found',
  ORIGINAL_SHARED_POST_NOT_AVAILABLE:
    'Original shared post is no longer available',
  SHARE_FAILED: 'Failed to share post',
  ORIGINAL_POST_NOT_FOUND: 'Original post not found',

  MISSING_FILE: 'Missing file',
  MISSING_POST_ID: 'Missing postId',
  MISSING_CONTENT_OR_MEDIA: 'Content or media is required',
  INVALID_MEDIA_FILE_TYPE: 'Invalid media file type',
  ALREADY_LIKED: 'Post already liked',
  NOT_LIKED_YET: 'Post not liked yet',
  ALREADY_BOOKMARKED: 'Post already bookmarked',
  NOT_BOOKMARKED_YET: 'Post not bookmarked yet',
} as const;

export const POST_STORAGE = {
  BUCKET_NAME: 'images',
  IMAGE_FOLDER: 'post-images',
  VIDEO_FOLDER: 'post-videos',
  DEFAULT_IMAGE_EXT: 'jpg',
  DEFAULT_VIDEO_EXT: 'mp4',
} as const;

export const POST_VISIBILITY = {
  PUBLIC: 'public',
  FOLLOWERS: 'followers',
  PRIVATE: 'private',
} as const;

export const POST_DEPTH = {
  ROOT: 0,
  COMMENT: 1,
  REPLY: 2,
} as const;

export const POST_NOTIFICATION_TYPE = {
  LIKE_POST: 'like_post',
  COMMENT_POST: 'comment_post',
  REPLY_COMMENT: 'reply_comment',
  SHARE_POST: 'share_post',
} as const;

export const POST_NOTIFICATION_GROUP_KEY = {
  likePost: (postId: string) => `like_post:${postId}`,
  commentPost: (postId: string) => `comment_post:${postId}`,
  replyComment: (commentId: string) => `reply_comment:${commentId}`,
  sharePost: (postId: string) => `share_post:${postId}`,
} as const;

export const POST_TRENDING = {
  LIMIT: 5,
  QUERY_LIMIT: 50,
  COMMENT_WEIGHT: 2,
  SHARE_WEIGHT: 3,
} as const;
