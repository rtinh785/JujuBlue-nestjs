export const NOTIFICATION_MESSAGE = {
  ALREADY_CLICKED: 'Notification already clicked',
  MARKED_AS_CLICKED: 'Notification marked as clicked',
  GROUP_MARKED_AS_CLICKED: 'Notification group marked as clicked',
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
} as const;

export const GROUPED_NOTIFICATION_TYPES = ['like_post', 'follow_user'] as const;
