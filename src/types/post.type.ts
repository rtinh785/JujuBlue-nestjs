export type PostWithId = {
  id: string;
} & Record<string, unknown>;

export type PostWithLikeStatus = PostWithId & {
  is_liked: boolean;
};
