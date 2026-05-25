import { BadRequestException } from '@nestjs/common';
import { POST_DEPTH } from '../core/constants/post.constant';
import { POST_WITH_AUTHOR_SELECT } from '../core/constants/select/post.select';
import { supabase } from '../libs/supabase/supabase';
import { PostWithId, PostWithStatus } from '../types/post.type';

const getPostLikesSet = async (
  userId: string,
  postIds: string[],
): Promise<Set<string>> => {
  if (postIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds)
    .returns<{ post_id: string }[]>();

  if (error) throw new BadRequestException(error.message);

  return new Set((data ?? []).map((x) => x.post_id));
};

const getPostBookmarksSet = async (
  userId: string,
  postIds: string[],
): Promise<Set<string>> => {
  if (postIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('post_bookmarks')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds)
    .returns<{ post_id: string }[]>();

  if (error) throw new BadRequestException(error.message);

  return new Set((data ?? []).map((x) => x.post_id));
};

export const attachViewerPostStatus = async (
  posts: PostWithId[],
  viewerId: string | null,
): Promise<PostWithStatus[]> => {
  if (!viewerId) {
    return posts.map((post) => ({
      ...post,
      is_liked: false,
      is_bookmark: false,
    }));
  }

  const postIds = posts.map((post) => post.id);

  if (postIds.length === 0) {
    return [];
  }

  const likedPostIds = await getPostLikesSet(viewerId, postIds);

  const bookmarkedPostIds = await getPostBookmarksSet(viewerId, postIds);

  return posts.map((post) => ({
    ...post,
    is_liked: likedPostIds.has(post.id),
    is_bookmark: bookmarkedPostIds.has(post.id),
  }));
};

export const attachSharedPosts = async (
  posts: PostWithStatus[],
  viewerId?: string | null,
): Promise<PostWithStatus[]> => {
  const sharedPostIds = [
    ...new Set(
      posts
        .map((post) => post.shared_post_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (sharedPostIds.length === 0) {
    return posts.map((post) => ({
      ...post,
      shared_post: null,
    }));
  }

  const { data: sharedPosts, error: sharedPostsError } = await supabase
    .from('posts')
    .select(POST_WITH_AUTHOR_SELECT)
    .in('id', sharedPostIds)
    .eq('depth', POST_DEPTH.ROOT);

  if (sharedPostsError) {
    throw new BadRequestException(sharedPostsError.message);
  }

  const sharedPostsWithStatus = await attachViewerPostStatus(
    sharedPosts ?? [],
    viewerId ?? null,
  );

  const sharedPostMap = new Map(
    sharedPostsWithStatus.map((sharedPost) => [sharedPost.id, sharedPost]),
  );

  return posts.map((post) => {
    const sharedPostId =
      typeof post.shared_post_id === 'string' ? post.shared_post_id : null;

    return {
      ...post,
      shared_post: sharedPostId
        ? (sharedPostMap.get(sharedPostId) ?? null)
        : null,
    };
  });
};
