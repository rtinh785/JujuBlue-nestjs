export type PostWithId = {
  id: string;
} & Record<string, unknown>;

export type PostWithStatus = PostWithId & {
  is_liked: boolean;
  is_bookmark: boolean;
};
