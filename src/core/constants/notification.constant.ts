export const NOTIFICATION_MESSAGE = {
  ALREADY_CLICKED: 'Notification already clicked',
  MARKED_AS_CLICKED: 'Notification marked as clicked',
  GROUP_MARKED_AS_CLICKED: 'Notification group marked as clicked',
  LIKE_NOTIFICATION_DELETED: 'Like notification deleted',
  FOLLOW_NOTIFICATION_DELETED: 'Follow notification deleted',
  SHARE_NOTIFICATION_DELETED: 'Share notification deleted',
  COMMENT_NOTIFICATIONS_DELETED: 'Comment notifications deleted',
  POST_NOTIFICATIONS_DELETED: 'Post notifications deleted',
} as const;

export const NOTIFICATION_ERROR = {
  MISSING_NOTIFICATION_ID: 'Missing notificationId',
  NOT_FOUND: 'Notification not found',
  NOT_ALLOWED_UPDATE: 'You are not allowed to update this notification',
  MISSING_GROUP_KEY: 'Missing groupKey',
  NOT_GROUPED_TYPE: 'Notification type is not grouped',
} as const;

export const NOTIFICATION_QUERY = {
  DEFAULT_LIMIT: 10,
  LOAD_MORE_LIMIT: 5,
  MAX_LIMIT: 20,
} as const;

export const NOTIFICATION_TYPE = {
  LIKE_POST: 'like_post',
  FOLLOW_USER: 'follow_user',
  SHARE_POST: 'share_post',
  COMMENT_POST: 'comment_post',
  REPLY_COMMENT: 'reply_comment',
} as const;

export const GROUPED_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPE.LIKE_POST,
  NOTIFICATION_TYPE.FOLLOW_USER,
] as const;
