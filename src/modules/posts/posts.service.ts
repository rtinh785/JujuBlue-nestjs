import { BadRequestException, Injectable } from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { getUserId } from '../../helpers/getUserId';
import { supabase } from '../../libs/supabase/supabase';
import { POST_WITH_AUTHOR_SELECT } from '../../core/constants/post.select';
import { randomUUID } from 'node:crypto';
import { ERROR, POST } from '../../core/constants/message';
import { PostMediaItem } from '../../types/media.type';
import { PostWithId, PostWithStatus } from '../../types/post.type';

@Injectable()
export class PostsService {
  private async resolveViewerId(authHeader?: string): Promise<string | null> {
    if (!authHeader) {
      return null;
    }

    return getUserId(authHeader);
  }

  private async getPostLikesSet(
    userId: string,
    postIds: string[],
  ): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();

    const { data, error } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds)
      .returns<{ post_id: string }[]>();

    if (error) throw new BadRequestException(error.message);

    return new Set((data ?? []).map((x) => x.post_id));
  }

  private async getPostBookmarksSet(
    userId: string,
    postIds: string[],
  ): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();

    const { data, error } = await supabase
      .from('post_bookmarks')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds)
      .returns<{ post_id: string }[]>();

    if (error) throw new BadRequestException(error.message);

    return new Set((data ?? []).map((x) => x.post_id));
  }

  private async attachViewerPostStatus(
    posts: PostWithId[],
    viewerId: string | null,
  ): Promise<PostWithStatus[]> {
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

    const likedPostIds = await this.getPostLikesSet(viewerId, postIds);

    const bookmarkedPostIds = await this.getPostBookmarksSet(viewerId, postIds);

    return posts.map((post) => ({
      ...post,
      is_liked: likedPostIds.has(post.id),
      is_bookmark: bookmarkedPostIds.has(post.id),
    }));
  }

  async createPost(userId: string, body: CreatePostDto) {
    const content = body.content?.trim() ?? '';
    const media = body.media ?? null;
    const visibility = body.visibility;

    if (!content && (!media || media.length === 0)) {
      throw new BadRequestException(POST.MISSING_CONTENT_OR_MEDIA);
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: userId,
        content,
        media,
        visibility,
        parent_post_id: null,
        root_post_id: null,
        depth: 0,
        likes_count: 0,
        comments_count: 0,
      })
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { post: data };
  }

  async getFeed(authHeader?: string) {
    const viewerId = await this.resolveViewerId(authHeader);

    const { data: publicPosts, error: publicPostsError } = await supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('depth', 0)
      .eq('visibility', 'public');

    if (publicPostsError) {
      throw new BadRequestException(publicPostsError.message);
    }

    if (!viewerId) {
      const sortedPublicPosts = [...(publicPosts ?? [])].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const enrichedPublicPosts = await this.attachViewerPostStatus(
        sortedPublicPosts,
        viewerId,
      );
      return enrichedPublicPosts;
    }

    const { data: followingRows, error: followingError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', viewerId);

    if (followingError) {
      throw new BadRequestException(followingError.message);
    }

    const followingIds = (followingRows ?? []).map((row) => row.following_id);

    let followersOnlyPosts: typeof publicPosts = [];

    if (followingIds.length > 0) {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_WITH_AUTHOR_SELECT)
        .eq('depth', 0)
        .eq('visibility', 'followers')
        .in('author_id', followingIds);

      if (error) {
        throw new BadRequestException(error.message);
      }

      followersOnlyPosts = data ?? [];
    }

    const { data: myPrivatePosts, error: myPrivatePostsError } = await supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('depth', 0)
      .eq('author_id', viewerId)
      .in('visibility', ['followers', 'private']);

    if (myPrivatePostsError) {
      throw new BadRequestException(myPrivatePostsError.message);
    }

    const feedPosts = [
      ...(publicPosts ?? []),
      ...(followersOnlyPosts ?? []),
      ...(myPrivatePosts ?? []),
    ].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const enrichedPosts = await this.attachViewerPostStatus(
      feedPosts,
      viewerId,
    );

    return enrichedPosts;
  }

  async getProfilePosts(authHeader: string | undefined, userId: string) {
    const viewerId = await this.resolveViewerId(authHeader);

    let canSeeFollowersOnlyPosts = false;

    if (viewerId && viewerId !== userId) {
      const { data: followRow, error: followError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', viewerId)
        .eq('following_id', userId)
        .maybeSingle();

      if (followError) {
        throw new BadRequestException(followError.message);
      }

      canSeeFollowersOnlyPosts = !!followRow;
    }

    let query = supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('author_id', userId)
      .eq('depth', 0)
      .order('created_at', { ascending: false });

    if (!viewerId) {
      query = query.eq('visibility', 'public');
    } else if (viewerId !== userId) {
      query = canSeeFollowersOnlyPosts
        ? query.in('visibility', ['public', 'followers'])
        : query.eq('visibility', 'public');
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(error.message);
    }

    const enrichedPosts = await this.attachViewerPostStatus(
      data ?? [],
      viewerId,
    );

    return { posts: enrichedPosts };
  }

  async uploadMedia(
    userId: string,
    files?: Express.Multer.File[],
  ): Promise<{ media: PostMediaItem[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException(ERROR.MISSING_FILE);
    }

    const uploadedMedia: PostMediaItem[] = [];

    for (const file of files) {
      const isImage = file.mimetype.startsWith('image/');
      const isVideo = file.mimetype.startsWith('video/');

      if (!isImage && !isVideo) {
        throw new BadRequestException(POST.INVALID_MEDIA_FILE_TYPE);
      }

      const ext =
        file.originalname.split('.').pop() || (isImage ? 'jpg' : 'mp4');
      const folder = isImage ? 'post-images' : 'post-videos';
      const fileName = `${folder}/${userId}/${randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        throw new BadRequestException(uploadError.message);
      }

      const { data: publicUrl } = supabase.storage
        .from('images')
        .getPublicUrl(fileName);

      uploadedMedia.push({
        url: publicUrl.publicUrl,
        type: isImage ? 'image' : 'video',
      });
    }

    return { media: uploadedMedia };
  }

  async likePost(userId: string, postId: string) {
    if (!postId) {
      throw new BadRequestException(ERROR.MISSING_POST_ID);
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, likes_count')
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      throw new BadRequestException(postError.message);
    }
    if (!post) {
      throw new BadRequestException(ERROR.POST_NOT_FOUND);
    }

    const { data: existingLike, error: existingLikeError } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingLikeError) {
      throw new BadRequestException(existingLikeError.message);
    }

    if (existingLike) {
      throw new BadRequestException(POST.ALREADY_LIKED);
    }

    const { error } = await supabase
      .from('post_likes')
      .insert({
        post_id: postId,
        user_id: userId,
      })
      .select('*')
      .single();
    if (error) {
      throw new BadRequestException(error.message);
    }

    const { error: updatePostError } = await supabase
      .from('posts')
      .update({
        likes_count: (post.likes_count ?? 0) + 1,
      })
      .eq('id', postId);

    if (updatePostError) {
      throw new BadRequestException(updatePostError.message);
    }

    return { message: POST.LIKE_SUCCESS };
  }

  async unlikePost(userId: string, postId: string) {
    if (!postId) {
      throw new BadRequestException(ERROR.MISSING_POST_ID);
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, likes_count')
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      throw new BadRequestException(postError.message);
    }

    if (!post) {
      throw new BadRequestException(ERROR.POST_NOT_FOUND);
    }

    const { data: existingLike, error: existingLikeError } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingLikeError) {
      throw new BadRequestException(existingLikeError.message);
    }

    if (!existingLike) {
      throw new BadRequestException(POST.NOT_LIKED_YET);
    }

    const { error: deleteLikeError } = await supabase
      .from('post_likes')
      .delete()
      .eq('id', existingLike.id);

    if (deleteLikeError) {
      throw new BadRequestException(deleteLikeError.message);
    }

    const { error: updatePostError } = await supabase
      .from('posts')
      .update({
        likes_count: Math.max((post.likes_count ?? 0) - 1, 0),
      })
      .eq('id', postId);

    if (updatePostError) {
      throw new BadRequestException(updatePostError.message);
    }

    return { message: POST.UNLIKE_SUCCESS };
  }

  async bookmarkPost(userId: string, postId: string) {
    if (!postId) {
      throw new BadRequestException(ERROR.MISSING_POST_ID);
    }
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      throw new BadRequestException(postError.message);
    }

    if (!post) {
      throw new BadRequestException(ERROR.POST_NOT_FOUND);
    }

    const { data: existing, error: existingError } = await supabase
      .from('post_bookmarks')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) {
      throw new BadRequestException(existingError.message);
    }

    if (existing) {
      throw new BadRequestException(POST.ALREADY_BOOKMARKED);
    }

    const { error } = await supabase.from('post_bookmarks').insert({
      post_id: postId,
      user_id: userId,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: POST.BOOKMARK_SUCCESS };
  }

  async unbookmarkPost(userId: string, postId: string) {
    if (!postId) {
      throw new BadRequestException(ERROR.MISSING_POST_ID);
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      throw new BadRequestException(postError.message);
    }

    if (!post) {
      throw new BadRequestException(ERROR.POST_NOT_FOUND);
    }

    const { data: existing, error: existingError } = await supabase
      .from('post_bookmarks')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) {
      throw new BadRequestException(existingError.message);
    }

    if (!existing) {
      throw new BadRequestException(POST.NOT_BOOKMARKED_YET);
    }

    const { error: deleteError } = await supabase
      .from('post_bookmarks')
      .delete()
      .eq('id', existing.id);

    if (deleteError) {
      throw new BadRequestException(deleteError.message);
    }

    return { message: POST.UNBOOKMARK_SUCCESS };
  }

  async getCounts(userId: string): Promise<{ postsCount: number }> {
    const { count: postsCount, error: postsCountError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', userId);

    if (postsCountError) throw new BadRequestException(postsCountError.message);

    return {
      postsCount: postsCount ?? 0,
    };
  }

  async getBookmark(userId: string): Promise<PostWithStatus[]> {
    const { data: bookmarks, error: bookmarkError } = await supabase
      .from('post_bookmarks')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (bookmarkError) throw new BadRequestException(bookmarkError.message);

    const postIds = (bookmarks ?? []).map((bookmark) => bookmark.post_id);

    if (postIds.length === 0) return [];

    const { data: bookmarkedPosts, error: bookmarkedPostsError } =
      await supabase
        .from('posts')
        .select(POST_WITH_AUTHOR_SELECT)
        .in('id', postIds);

    if (bookmarkedPostsError) {
      throw new BadRequestException(bookmarkedPostsError.message);
    }

    // Ví dụ: { id: 'p2', content: 'Bài 2' } =>    ['p2', { id: 'p2', content: 'Bài 2' }],
    const postMap = new Map(
      (bookmarkedPosts ?? []).map((post) => [post.id, post]),
    );

    const sortedBookmarkedPosts = postIds
      .map((postId) => postMap.get(postId)) // lấy ra dc đúng thứ tự rồi nhưng vẫn chứa undefined
      .filter((post): post is NonNullable<typeof post> => !!post); // lọc bỏ undefined

    const enrichedPosts = await this.attachViewerPostStatus(
      sortedBookmarkedPosts,
      userId,
    );

    return enrichedPosts;
  }
}
