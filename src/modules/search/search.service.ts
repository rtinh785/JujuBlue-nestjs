import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SearchResponse,
  SearchSort,
  SearchType,
  SearchUserItem,
} from '@/types/search.type';
import {
  SEARCH_QUERY,
  SEARCH_SORT,
  SEARCH_TYPE,
} from '@/core/constants/search.constant';
import { supabase } from '@/libs/supabase/supabase';
import { POST_WITH_AUTHOR_SELECT } from '@/core/constants/select/post.select';
import { POST_DEPTH, POST_VISIBILITY } from '@/core/constants/post.constant';
import {
  attachSharedPosts,
  attachViewerPostStatus,
} from '@/helpers/post-enrichment.helper';

@Injectable()
export class SearchService {
  private buildVisiblePostsFilter(userId: string) {
    return [
      `visibility.eq.${POST_VISIBILITY.PUBLIC}`,
      `and(author_id.eq.${userId},visibility.in.(${POST_VISIBILITY.FOLLOWERS},${POST_VISIBILITY.PRIVATE}))`,
    ].join(',');
  }

  private normalizeSearchType(type?: string): SearchType {
    if (
      type === SEARCH_TYPE.POSTS ||
      type === SEARCH_TYPE.USERS ||
      type === SEARCH_TYPE.ALL
    ) {
      return type;
    }

    return SEARCH_TYPE.ALL;
  }

  private normalizeSearchSort(sort?: string): SearchSort {
    if (sort === SEARCH_SORT.OLDEST || sort === SEARCH_SORT.LATEST) {
      return sort;
    }

    return SEARCH_SORT.LATEST;
  }

  private async searchUsers(keyword: string): Promise<SearchUserItem[]> {
    const keywordPattern = `%${keyword}%`;

    const [usernameResult, displayNameResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', keywordPattern)
        .limit(SEARCH_QUERY.USERS_LIMIT),
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('display_name', keywordPattern)
        .limit(SEARCH_QUERY.USERS_LIMIT),
    ]);

    const { data: usernameMatches, error: usernameError } = usernameResult;
    const { data: displayNameMatches, error: displayNameError } =
      displayNameResult;

    if (usernameError) {
      throw new BadRequestException(usernameError.message);
    }

    if (displayNameError) {
      throw new BadRequestException(displayNameError.message);
    }

    const usersMap = new Map<string, SearchUserItem>();

    // set chống bị trùng id , nếu trùng sẽ lấy cái đầu tiên tìm được bỏ cái sau
    for (const user of [
      ...(usernameMatches ?? []),
      ...(displayNameMatches ?? []),
    ]) {
      usersMap.set(user.id, user);
    }

    return [...usersMap.values()].slice(0, SEARCH_QUERY.USERS_LIMIT);
  }

  private sortPostsByCreatedAt<T extends { id: string; created_at: string }>(
    posts: T[],
    sort: SearchSort,
  ): T[] {
    const ascending = sort === SEARCH_SORT.OLDEST;

    return [...posts].sort((a, b) => {
      const timeDiff = ascending
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

      if (timeDiff !== 0) {
        return timeDiff;
      }

      return a.id.localeCompare(b.id);
    });
  }

  private async searchPosts(
    userId: string,
    keyword: string,
    sort: SearchSort,
  ): Promise<SearchResponse['posts']> {
    const keywordPattern = `%${keyword}%`;
    const ascending = sort === SEARCH_SORT.OLDEST;

    const [visiblePostsResult, followingResult] = await Promise.all([
      supabase
        .from('posts')
        .select(POST_WITH_AUTHOR_SELECT)
        .eq('depth', POST_DEPTH.ROOT)
        .ilike('content', keywordPattern)
        .or(this.buildVisiblePostsFilter(userId))
        .order('created_at', { ascending })
        .order('id', { ascending: true })
        .limit(SEARCH_QUERY.POSTS_LIMIT),
      supabase.from('follows').select('following_id').eq('follower_id', userId),
    ]);

    const { data: directlyVisiblePosts, error: visiblePostsError } =
      visiblePostsResult;
    const { data: followingRows, error: followingError } = followingResult;

    if (visiblePostsError) {
      throw new BadRequestException(visiblePostsError.message);
    }

    if (followingError) {
      throw new BadRequestException(followingError.message);
    }

    const followingIds = (followingRows ?? []).map((row) => row.following_id);

    let followersOnlyPosts: typeof directlyVisiblePosts = [];

    if (followingIds.length > 0) {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_WITH_AUTHOR_SELECT)
        .eq('depth', POST_DEPTH.ROOT)
        .eq('visibility', POST_VISIBILITY.FOLLOWERS)
        .in('author_id', followingIds)
        .ilike('content', keywordPattern)
        .order('created_at', { ascending })
        .order('id', { ascending: true })
        .limit(SEARCH_QUERY.POSTS_LIMIT);

      if (error) {
        throw new BadRequestException(error.message);
      }

      followersOnlyPosts = data ?? [];
    }

    const visiblePosts = [
      ...(directlyVisiblePosts ?? []),
      ...(followersOnlyPosts ?? []),
    ];

    const sortedPosts = this.sortPostsByCreatedAt(visiblePosts, sort).slice(
      0,
      SEARCH_QUERY.POSTS_LIMIT,
    );

    const enrichedPosts = await attachViewerPostStatus(sortedPosts, userId);

    return attachSharedPosts(enrichedPosts, userId);
  }

  async search(
    userId: string,
    query: {
      q?: string;
      type?: string;
      sort?: string;
    },
  ): Promise<SearchResponse> {
    const keyword = query.q?.trim() ?? '';

    if (!keyword) {
      return {
        posts: [],
        users: [],
      };
    }

    const type = this.normalizeSearchType(query.type);
    const sort = this.normalizeSearchSort(query.sort);

    const shouldSearchPosts =
      type === SEARCH_TYPE.ALL || type === SEARCH_TYPE.POSTS;
    const shouldSearchUsers =
      type === SEARCH_TYPE.ALL || type === SEARCH_TYPE.USERS;

    const [posts, users] = await Promise.all([
      shouldSearchPosts ? this.searchPosts(userId, keyword, sort) : [],
      shouldSearchUsers ? this.searchUsers(keyword) : [],
    ]);

    return {
      posts,
      users,
    };
  }
}
