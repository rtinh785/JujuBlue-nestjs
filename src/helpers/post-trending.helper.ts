import { POST_TRENDING } from '../core/constants/post.constant';
import { TrendingPost } from '../types/post.type';

export const getTrendingScore = (post: TrendingPost) => {
  return (
    (post.likes_count ?? 0) +
    (post.comments_count ?? 0) * POST_TRENDING.COMMENT_WEIGHT +
    (post.shares_count ?? 0) * POST_TRENDING.SHARE_WEIGHT
  );
};

export const sortTrendingPosts = <T extends TrendingPost>(posts: T[]) => {
  return [...posts].sort((a, b) => {
    const scoreDiff = getTrendingScore(b) - getTrendingScore(a);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const createdAtDiff =
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return a.id.localeCompare(b.id);
  });
};
