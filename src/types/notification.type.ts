export type NotificationType =
  | 'like_post'
  | 'comment_post'
  | 'reply_comment'
  | 'follow_user'
  | 'share_post';

export type CreateNotificationInput = {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  targetPostId?: string | null;
  targetCommentId?: string | null;
  targetReplyId?: string | null;
  targetUserId?: string | null;
  sharePostId?: string | null;
  groupKey: string;
  metadata?: Record<string, unknown>;
};

export type NotificationActor = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  group_key: string;
  clicked_at: string | null;
  created_at: string;
  is_grouped: boolean;
  actor_count: number;
  other_actor_count: number;
  actor: NotificationActor | null;
  target_post_id: string | null;
  target_comment_id: string | null;
  target_reply_id: string | null;
  target_user_id: string | null;
  share_post_id: string | null;
  metadata: unknown;
};
