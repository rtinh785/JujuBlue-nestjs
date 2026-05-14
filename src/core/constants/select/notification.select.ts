export const NOTIFICATION_WITH_ACTOR_SELECT = `
  id,
  type,
  target_post_id,
  target_comment_id,
  target_reply_id,
  target_user_id,
  share_post_id,
  group_key,
  clicked_at,
  created_at,
  metadata,
  actor:profiles!notifications_actor_id_fkey (
    id,
    username,
    display_name,
    avatar_url
  )
`;
