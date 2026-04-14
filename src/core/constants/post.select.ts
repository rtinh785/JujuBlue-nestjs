export const POST_WITH_AUTHOR_SELECT = `
  id,
  content,
  media,
  visibility,
  parent_post_id,
  root_post_id,
  depth,
  likes_count,
  comments_count,
  created_at,
  updated_at,
  author:profiles!posts_author_id_fkey (
    id,
    username,
    display_name,
    avatar_url
  )
`;
