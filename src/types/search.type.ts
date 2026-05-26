import { PostWithStatus } from './post.type';

export type SearchType = 'all' | 'posts' | 'users';

export type SearchSort = 'latest' | 'oldest';

export type SearchUserItem = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type SearchResponse = {
  posts: PostWithStatus[];
  users: SearchUserItem[];
};
