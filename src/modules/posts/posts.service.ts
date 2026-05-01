import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { getUserId } from '../../helpers/getUserId';
import { supabase } from '../../libs/supabase/supabase';
import { POST_WITH_AUTHOR_SELECT } from '../../core/constants/post.select';
import { randomUUID } from 'node:crypto';
import { ERROR, POST } from '../../core/constants/message';
import { PostMediaItem } from '../../types/media.type';
import {
  DeletePostResponse,
  PostWithId,
  PostWithStatus,
  UpdatePostResponse,
} from '../../types/post.type';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Json } from '../../types/database.types';
import { UpdatePostDto } from './dto/update-post.dto';

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
  // giảm số lượng cmt
  private async adjustCommentsCount(postId: string, amount: number) {
    const { data: post, error: findError } = await supabase
      .from('posts')
      .select('comments_count')
      .eq('id', postId)
      .single();

    if (findError || !post) {
      throw new NotFoundException('Root post not found');
    }

    const currentCount = post.comments_count ?? 0;
    const nextCount = Math.max(currentCount + amount, 0);

    const { error: updateError } = await supabase
      .from('posts')
      .update({ comments_count: nextCount })
      .eq('id', postId);

    if (updateError) {
      throw new BadRequestException(updateError.message);
    }
  }

  async createPost(userId: string, body: CreatePostDto) {
    const content = body.content?.trim() ?? '';
    const media: Json[] | null =
      body.media?.map((item) => ({
        url: item.url,
        type: item.type,
      })) ?? null;
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

  async updatePost(
    postId: string,
    userId: string,
    body: UpdatePostDto,
  ): Promise<UpdatePostResponse> {
    const hasContent = body.content !== undefined;
    const hasVisibility = body.visibility !== undefined;

    if (!hasContent && !hasVisibility) {
      throw new BadRequestException('Nothing to update');
    }

    const { data: existingPost, error: findError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (findError || !existingPost) {
      throw new NotFoundException('Post not found');
    }

    if (existingPost.author_id !== userId) {
      throw new ForbiddenException('You are not allowed to update this post');
    }

    const updateData: {
      content?: string;
      visibility?: string;
    } = {};

    if (hasContent) {
      updateData.content = body.content?.trim() ?? '';
    }

    if (hasVisibility) {
      updateData.visibility = body.visibility;
    }

    const { data: updatedPost, error: updateError } = await supabase
      .from('posts')
      .update(updateData)
      .eq('id', postId)
      .select('*')
      .single();

    if (updateError || !updatedPost) {
      throw new BadRequestException(
        updateError?.message || 'Failed to update post',
      );
    }

    return {
      message: 'Post updated successfully',
      post: updatedPost,
    };
  }

  async deletePost(
    postId: string,
    userId: string,
  ): Promise<DeletePostResponse> {
    const { data: targetPost, error: findError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (findError || !targetPost) {
      throw new NotFoundException('Post not found');
    }

    if (targetPost.author_id !== userId) {
      throw new ForbiddenException('You are not allowed to delete this post');
    }

    let postIdsToDelete: string[] = [targetPost.id];

    if (targetPost.depth === 0) {
      const { data: childPosts, error: childError } = await supabase
        .from('posts')
        .select('id')
        .eq('root_post_id', targetPost.id);

      if (childError) {
        throw new BadRequestException(childError.message);
      }

      postIdsToDelete = [
        targetPost.id,
        ...(childPosts ?? []).map((post) => post.id),
      ];
    }

    if (targetPost.depth === 1) {
      const { data: replies, error: repliesError } = await supabase
        .from('posts')
        .select('id')
        .eq('parent_post_id', targetPost.id)
        .eq('depth', 2);

      if (repliesError) {
        throw new BadRequestException(repliesError.message);
      }

      postIdsToDelete = [
        targetPost.id,
        ...(replies ?? []).map((reply) => reply.id),
      ];
    }

    await supabase.from('post_likes').delete().in('post_id', postIdsToDelete);
    await supabase
      .from('post_bookmarks')
      .delete()
      .in('post_id', postIdsToDelete);

    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .in('id', postIdsToDelete);

    if (deleteError) {
      throw new BadRequestException(deleteError.message);
    }

    if (targetPost.depth === 1 || targetPost.depth === 2) {
      const rootPostId = targetPost.root_post_id;

      if (rootPostId) {
        await this.adjustCommentsCount(rootPostId, -postIdsToDelete.length);
      }
    }

    return {
      message: 'Post deleted successfully',
      deletedCount: postIdsToDelete.length,
    };
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

  async createComment(userId: string, postId: string, body: CreateCommentDto) {
    if (!postId) {
      throw new BadRequestException(ERROR.MISSING_POST_ID);
    }

    const content = body.content?.trim() ?? '';
    const media: Json[] | null =
      body.media?.map((item) => ({
        url: item.url,
        type: item.type,
      })) ?? null;
    const parentPostId = body.parentPostId ?? null;

    if (!content && (!media || media.length === 0)) {
      throw new BadRequestException(POST.MISSING_CONTENT_OR_MEDIA);
    }

    const { data: rootPost, error: rootPostError } = await supabase
      .from('posts')
      .select('id, depth, comments_count')
      .eq('id', postId)
      .maybeSingle();

    if (rootPostError) {
      throw new BadRequestException(rootPostError.message);
    }

    if (!rootPost || rootPost.depth !== 0) {
      throw new BadRequestException(ERROR.POST_NOT_FOUND);
    }

    // Mặc định là tạo cmt cấp 1
    let parentPostIdToSave: string = postId;
    let rootPostIdToSave: string = postId;
    let depth = 1;

    if (parentPostId) {
      const { data: parentPost, error: parentPostError } = await supabase
        .from('posts')
        .select('id, parent_post_id, root_post_id, depth')
        .eq('id', parentPostId)
        .maybeSingle();

      if (parentPostError) {
        throw new BadRequestException(parentPostError.message);
      }

      if (!parentPost) {
        throw new BadRequestException('Parent comment not found');
      }

      const belongsToThisPost =
        parentPost.root_post_id === postId ||
        parentPost.parent_post_id === postId;

      if (!belongsToThisPost) {
        throw new BadRequestException(
          'Parent comment does not belong to this post',
        );
      }
      // kiểm tra parent comment phải là comment hoặc reply chứ không được là post gốc hay dữ liệu bất thường
      if (parentPost.depth !== 1 && parentPost.depth !== 2) {
        throw new BadRequestException('Invalid parent comment depth');
      }

      parentPostIdToSave =
        parentPost.depth === 1
          ? parentPost.id
          : (parentPost.parent_post_id as string);

      rootPostIdToSave = postId;
      depth = 2;
    }

    const { data: createdComment, error: createCommentError } = await supabase
      .from('posts')
      .insert({
        author_id: userId,
        content,
        media,
        visibility: 'public',
        parent_post_id: parentPostIdToSave,
        root_post_id: rootPostIdToSave,
        depth,
        likes_count: 0,
        comments_count: 0,
      })
      .select(POST_WITH_AUTHOR_SELECT)
      .single();

    if (createCommentError) {
      throw new BadRequestException(createCommentError.message);
    }

    const nextCommentsCount = (rootPost.comments_count ?? 0) + 1;

    const { error: updateRootPostError } = await supabase
      .from('posts')
      .update({
        comments_count: nextCommentsCount,
      })
      .eq('id', postId);

    if (updateRootPostError) {
      throw new BadRequestException(updateRootPostError.message);
    }

    const [enrichedComment] = await this.attachViewerPostStatus(
      createdComment ? [createdComment] : [],
      userId,
    );

    return { comment: enrichedComment };
  }

  async getComments(postId: string, authHeader?: string) {
    if (!postId) {
      throw new BadRequestException(ERROR.MISSING_POST_ID);
    }

    const { data: rootPost, error: rootPostError } = await supabase
      .from('posts')
      .select('id, depth')
      .eq('id', postId)
      .maybeSingle();

    if (rootPostError) {
      throw new BadRequestException(rootPostError.message);
    }

    if (!rootPost || rootPost.depth !== 0) {
      throw new BadRequestException(ERROR.POST_NOT_FOUND);
    }

    const { data: comments, error: commentsError } = await supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('root_post_id', postId)
      .in('depth', [1, 2])
      .order('created_at', { ascending: true });

    if (commentsError) {
      throw new BadRequestException(commentsError.message);
    }
    const viewerId = await this.resolveViewerId(authHeader);

    const enrichedComments = await this.attachViewerPostStatus(
      comments ?? [],
      viewerId,
    );

    const parentComments = enrichedComments
      .filter((comment) => comment.depth === 1)
      .map((comment) => ({
        ...comment,
        replies: [] as PostWithStatus[],
      }));

    const replies = enrichedComments.filter((comment) => comment.depth === 2);

    const repliesMap = new Map<string, PostWithStatus[]>();

    for (const reply of replies) {
      const parentId = reply.parent_post_id;

      if (typeof parentId !== 'string') continue;

      const currentReplies = repliesMap.get(parentId) ?? [];
      currentReplies.push(reply);
      repliesMap.set(parentId, currentReplies);
    }

    const structuredComments = parentComments.map((comment) => ({
      ...comment,
      replies: repliesMap.get(comment.id) ?? [],
    }));

    return { comments: structuredComments };
  }
}
