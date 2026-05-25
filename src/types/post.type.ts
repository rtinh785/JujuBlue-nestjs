export type PostWithId = {
  id: string;
} & Record<string, unknown>;

export type PostWithStatus = PostWithId & {
  is_liked: boolean;
  is_bookmark: boolean;
  shared_post?: PostWithStatus | null;
};

export type UpdatePostResponse = {
  message: string;
  post: {
    id: string;
    author_id: string;
    content: string | null;
    media: unknown;
    likes_count: number | null;
    visibility: string | null;
    created_at: string | null;
    updated_at: string | null;
    parent_post_id?: string | null;
    root_post_id?: string | null;
    depth?: number | null;
    comments_count?: number | null;
  };
};

export type DeletePostResponse = {
  message: string;
  deletedCount: number;
};

export type ShareTargetPost = {
  id: string;
  author_id: string;
  shared_post_id: string | null;
  was_shared_post: boolean;
  depth: number | null;
};

export type TrendingPost = PostWithId & {
  created_at: string;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
};
