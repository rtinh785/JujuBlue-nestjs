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

    const { data: usernameMatches, error: usernameError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .ilike('username', keywordPattern)
      .limit(SEARCH_QUERY.USERS_LIMIT);

    if (usernameError) {
      throw new BadRequestException(usernameError.message);
    }

    const { data: displayNameMatches, error: displayNameError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .ilike('display_name', keywordPattern)
      .limit(SEARCH_QUERY.USERS_LIMIT);

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

    const { data: publicPosts, error: publicPostsError } = await supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('depth', POST_DEPTH.ROOT)
      .eq('visibility', POST_VISIBILITY.PUBLIC)
      .ilike('content', keywordPattern)
      .order('created_at', { ascending })
      .order('id', { ascending: true })
      .limit(SEARCH_QUERY.POSTS_LIMIT);

    if (publicPostsError) {
      throw new BadRequestException(publicPostsError.message);
    }

    const { data: followingRows, error: followingError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (followingError) {
      throw new BadRequestException(followingError.message);
    }

    const followingIds = (followingRows ?? []).map((row) => row.following_id);

    let followersOnlyPosts: typeof publicPosts = [];

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

    const { data: myPrivatePosts, error: myPrivatePostsError } = await supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('depth', POST_DEPTH.ROOT)
      .eq('author_id', userId)
      .in('visibility', [POST_VISIBILITY.FOLLOWERS, POST_VISIBILITY.PRIVATE])
      .ilike('content', keywordPattern)
      .order('created_at', { ascending })
      .order('id', { ascending: true })
      .limit(SEARCH_QUERY.POSTS_LIMIT);

    if (myPrivatePostsError) {
      throw new BadRequestException(myPrivatePostsError.message);
    }

    const visiblePosts = [
      ...(publicPosts ?? []),
      ...(followersOnlyPosts ?? []),
      ...(myPrivatePosts ?? []),
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

    const posts = shouldSearchPosts
      ? await this.searchPosts(userId, keyword, sort)
      : [];

    const users = shouldSearchUsers ? await this.searchUsers(keyword) : [];

    return {
      posts,
      users,
    };
  }
}
