import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { getUserId } from '../../helpers/getUserId';
import { supabase } from '../../libs/supabase/supabase';
import { POST_WITH_AUTHOR_SELECT } from '../../core/constants/select/post.select';
import { randomUUID } from 'node:crypto';
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
import { SharePostDto } from './dto/share-post.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  POST_DEPTH,
  POST_ERROR,
  POST_MESSAGE,
  POST_NOTIFICATION_GROUP_KEY,
  POST_NOTIFICATION_TYPE,
  POST_STORAGE,
  POST_VISIBILITY,
} from '../../core/constants/post.constant';

type ShareTargetPost = {
  id: string;
  author_id: string;
  shared_post_id: string | null;
  was_shared_post: boolean;
  depth: number | null;
};

@Injectable()
export class PostsService {
  constructor(private readonly notificationsService: NotificationsService) {}

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
      throw new NotFoundException(POST_ERROR.ROOT_POST_NOT_FOUND);
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

  private async attachSharedPosts(
    posts: PostWithStatus[],
    viewerId?: string | null,
  ): Promise<PostWithStatus[]> {
    const sharedPostIds = [
      ...new Set(
        posts
          .map((post) => post.shared_post_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ]; // Lấy ra tất cả shared_post_id từ danh sách posts => ["123", "456"]

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

    const sharedPostsWithStatus = await this.attachViewerPostStatus(
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
      throw new BadRequestException(POST_ERROR.MISSING_CONTENT_OR_MEDIA);
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
        depth: POST_DEPTH.ROOT,
        likes_count: 0,
        comments_count: 0,
        was_shared_post: false,
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
    const hasMedia = body.media !== undefined;

    if (!hasContent && !hasVisibility && !hasMedia) {
      throw new BadRequestException(POST_ERROR.NOTHING_TO_UPDATE);
    }

    const { data: existingPost, error: findError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (findError || !existingPost) {
      throw new NotFoundException(POST_ERROR.NOT_FOUND);
    }

    if (existingPost.author_id !== userId) {
      throw new ForbiddenException(POST_ERROR.UPDATE_FORBIDDEN);
    }

    const updateData: {
      content?: string;
      visibility?: string;
      media?: Json | null;
    } = {};

    if (hasContent) {
      updateData.content = body.content?.trim() ?? '';
    }

    if (hasVisibility) {
      updateData.visibility = body.visibility;
    }

    if (hasMedia) {
      updateData.media = (body.media ?? null) as Json | null;
    }

    const { data: updatedPost, error: updateError } = await supabase
      .from('posts')
      .update(updateData)
      .eq('id', postId)
      .select('*')
      .single();

    if (updateError || !updatedPost) {
      throw new BadRequestException(
        updateError?.message || POST_ERROR.UPDATE_FAILED,
      );
    }

    return {
      message: POST_MESSAGE.UPDATED,
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
      throw new NotFoundException(POST_ERROR.NOT_FOUND);
    }

    if (targetPost.author_id !== userId) {
      throw new ForbiddenException(POST_ERROR.DELETE_FORBIDDEN);
    }

    let postIdsToDelete: string[] = [targetPost.id];

    if (targetPost.depth === POST_DEPTH.ROOT) {
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

    if (targetPost.depth === POST_DEPTH.COMMENT) {
      const { data: replies, error: repliesError } = await supabase
        .from('posts')
        .select('id')
        .eq('parent_post_id', targetPost.id)
        .eq('depth', POST_DEPTH.REPLY);
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

    const sharedOriginalPostId =
      typeof targetPost.shared_post_id === 'string'
        ? targetPost.shared_post_id
        : null;

    if (sharedOriginalPostId) {
      const { error: deleteShareLogError } = await supabase
        .from('post_shares')
        .delete()
        .eq('shared_post_id', targetPost.id);

      if (deleteShareLogError) {
        throw new BadRequestException(deleteShareLogError.message);
      }
    }

    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .in('id', postIdsToDelete);

    if (deleteError) {
      throw new BadRequestException(deleteError.message);
    }

    if (
      targetPost.depth === POST_DEPTH.COMMENT ||
      targetPost.depth === POST_DEPTH.REPLY
    ) {
      const rootPostId = targetPost.root_post_id;

      if (rootPostId) {
        await this.adjustCommentsCount(rootPostId, -postIdsToDelete.length);
      }
    }

    if (sharedOriginalPostId) {
      const { data: originalPost, error: originalPostError } = await supabase
        .from('posts')
        .select('shares_count')
        .eq('id', sharedOriginalPostId)
        .maybeSingle();

      if (originalPostError) {
        throw new BadRequestException(originalPostError.message);
      }

      if (originalPost) {
        const { error: updateShareCountError } = await supabase
          .from('posts')
          .update({
            shares_count: Math.max((originalPost.shares_count ?? 0) - 1, 0),
          })
          .eq('id', sharedOriginalPostId);

        if (updateShareCountError) {
          throw new BadRequestException(updateShareCountError.message);
        }
      }
    }

    return {
      message: POST_MESSAGE.DELETED,
      deletedCount: postIdsToDelete.length,
    };
  }

  async getFeed(authHeader?: string) {
    const viewerId = await this.resolveViewerId(authHeader);

    const { data: publicPosts, error: publicPostsError } = await supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('depth', POST_DEPTH.ROOT)

      .eq('visibility', POST_VISIBILITY.PUBLIC);

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

      const publicPostsWithSharedPosts = await this.attachSharedPosts(
        enrichedPublicPosts,
        viewerId,
      );

      return publicPostsWithSharedPosts;
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
        .eq('depth', POST_DEPTH.ROOT)

        .eq('visibility', POST_VISIBILITY.FOLLOWERS)
        .in('author_id', followingIds);

      if (error) {
        throw new BadRequestException(error.message);
      }

      followersOnlyPosts = data ?? [];
    }

    const { data: myPrivatePosts, error: myPrivatePostsError } = await supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('depth', POST_DEPTH.ROOT)

      .eq('author_id', viewerId)
      .in('visibility', [POST_VISIBILITY.FOLLOWERS, POST_VISIBILITY.PRIVATE]);

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
    const postsWithSharedPosts = await this.attachSharedPosts(
      enrichedPosts,
      viewerId,
    );

    return postsWithSharedPosts;
  }

  async getProfilePosts(authHeader: string | undefined, userId: string) {
    // check coi có đăng nhập chưa
    const viewerId = await this.resolveViewerId(authHeader);

    let canSeeFollowersOnlyPosts = false;

    // check coi có login chưa và không phải đang xem profile của mình
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
    // query tất cả bài viết trước khi filter và cũng là trường hợp nếu như mình vào profile của mình
    let query = supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('author_id', userId)
      .eq('depth', POST_DEPTH.ROOT)

      .order('created_at', { ascending: false });

    // nếu chưa đăng nhập thì chỉ xem đuọc bài công khai
    if (!viewerId) {
      query = query.eq('visibility', POST_VISIBILITY.PUBLIC);
    } else if (viewerId !== userId) {
      query = canSeeFollowersOnlyPosts
        ? query.in('visibility', [
            POST_VISIBILITY.PUBLIC,
            POST_VISIBILITY.FOLLOWERS,
          ])
        : query.eq('visibility', POST_VISIBILITY.PUBLIC);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(error.message);
    }

    const enrichedPosts = await this.attachViewerPostStatus(
      data ?? [],
      viewerId,
    );
    const postsWithSharedPosts = await this.attachSharedPosts(
      enrichedPosts,
      viewerId,
    );

    return { posts: postsWithSharedPosts };
  }

  async uploadMedia(
    userId: string,
    files?: Express.Multer.File[],
  ): Promise<{ media: PostMediaItem[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException(POST_ERROR.MISSING_FILE);
    }

    const uploadedMedia: PostMediaItem[] = [];

    for (const file of files) {
      const isImage = file.mimetype.startsWith('image/');
      const isVideo = file.mimetype.startsWith('video/');

      if (!isImage && !isVideo) {
        throw new BadRequestException(POST_ERROR.INVALID_MEDIA_FILE_TYPE);
      }

      const ext =
        file.originalname.split('.').pop() ||
        (file.mimetype.startsWith('image/')
          ? POST_STORAGE.DEFAULT_IMAGE_EXT
          : POST_STORAGE.DEFAULT_VIDEO_EXT);

      const folder = file.mimetype.startsWith('image/')
        ? POST_STORAGE.IMAGE_FOLDER
        : POST_STORAGE.VIDEO_FOLDER;

      const fileName = `${folder}/${userId}/${randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(POST_STORAGE.BUCKET_NAME)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        throw new BadRequestException(uploadError.message);
      }

      const { data: publicUrl } = supabase.storage
        .from(POST_STORAGE.BUCKET_NAME)
        .getPublicUrl(fileName);

      uploadedMedia.push({
        url: publicUrl.publicUrl,
        type: isImage ? 'image' : 'video',
      });
    }

    return { media: uploadedMedia };
  }

  async getPostById(postId: string, authHeader?: string) {
    const viewerId = await this.resolveViewerId(authHeader);

    const { data, error } = await supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('id', postId)
      .eq('depth', POST_DEPTH.ROOT)

      .single();

    if (error || !data) {
      throw new NotFoundException(POST_ERROR.NOT_FOUND);
    }

    const [postWithStatus] = await this.attachViewerPostStatus(
      [data],
      viewerId,
    );

    const [postWithSharedPost] = await this.attachSharedPosts(
      [postWithStatus],
      viewerId,
    );

    return { post: postWithSharedPost };
  }

  async likePost(userId: string, postId: string) {
    if (!postId) {
      throw new BadRequestException(POST_ERROR.MISSING_POST_ID);
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, author_id, likes_count, depth')
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      throw new BadRequestException(postError.message);
    }
    if (!post) {
      throw new BadRequestException(POST_ERROR.NOT_FOUND);
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
      throw new BadRequestException(POST_ERROR.ALREADY_LIKED);
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

    if (post.depth === 0) {
      await this.notificationsService.createNotification({
        recipientId: post.author_id,
        actorId: userId,
        type: POST_NOTIFICATION_TYPE.LIKE_POST,
        targetPostId: post.id,
        groupKey: POST_NOTIFICATION_GROUP_KEY.likePost(post.id),
      });
    }

    return { message: POST_MESSAGE.LIKE_SUCCESS };
  }

  async unlikePost(userId: string, postId: string) {
    if (!postId) {
      throw new BadRequestException(POST_ERROR.MISSING_POST_ID);
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
      throw new BadRequestException(POST_ERROR.NOT_FOUND);
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
      throw new BadRequestException(POST_ERROR.NOT_LIKED_YET);
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

    return { message: POST_MESSAGE.UNLIKE_SUCCESS };
  }

  async bookmarkPost(userId: string, postId: string) {
    if (!postId) {
      throw new BadRequestException(POST_ERROR.MISSING_POST_ID);
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
      throw new BadRequestException(POST_ERROR.NOT_FOUND);
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
      throw new BadRequestException(POST_ERROR.ALREADY_BOOKMARKED);
    }

    const { error } = await supabase.from('post_bookmarks').insert({
      post_id: postId,
      user_id: userId,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: POST_MESSAGE.BOOKMARK_SUCCESS };
  }

  async unbookmarkPost(userId: string, postId: string) {
    if (!postId) {
      throw new BadRequestException(POST_ERROR.MISSING_POST_ID);
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
      throw new BadRequestException(POST_ERROR.NOT_FOUND);
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
      throw new BadRequestException(POST_ERROR.NOT_BOOKMARKED_YET);
    }

    const { error: deleteError } = await supabase
      .from('post_bookmarks')
      .delete()
      .eq('id', existing.id);

    if (deleteError) {
      throw new BadRequestException(deleteError.message);
    }

    return { message: POST_MESSAGE.UNBOOKMARK_SUCCESS };
  }

  async getCounts(userId: string): Promise<{ postsCount: number }> {
    const { count: postsCount, error: postsCountError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', userId)
      .eq('depth', POST_DEPTH.ROOT);
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
    const postsWithSharedPosts = await this.attachSharedPosts(
      enrichedPosts,
      userId,
    );

    return postsWithSharedPosts;
  }

  async createComment(userId: string, postId: string, body: CreateCommentDto) {
    if (!postId) {
      throw new BadRequestException(POST_ERROR.MISSING_POST_ID);
    }

    const content = body.content?.trim() ?? '';
    const media: Json[] | null =
      body.media?.map((item) => ({
        url: item.url,
        type: item.type,
      })) ?? null;
    const parentPostId = body.parentPostId ?? null;

    if (!content && (!media || media.length === 0)) {
      throw new BadRequestException(POST_ERROR.MISSING_CONTENT_OR_MEDIA);
    }

    const { data: rootPost, error: rootPostError } = await supabase
      .from('posts')
      .select('id, author_id, depth, comments_count')
      .eq('id', postId)
      .maybeSingle();

    if (rootPostError) {
      throw new BadRequestException(rootPostError.message);
    }

    if (!rootPost || rootPost.depth !== 0) {
      throw new BadRequestException(POST_ERROR.NOT_FOUND);
    }

    // Mặc định là tạo cmt cấp 1
    let parentPostIdToSave: string = postId;
    let rootPostIdToSave: string = postId;
    let depth: number = POST_DEPTH.COMMENT;

    let replyTargetForNotification: {
      id: string;
      author_id: string;
      parent_post_id: string | null;
      root_post_id: string | null;
      depth: number | null;
    } | null = null;

    if (parentPostId) {
      const { data: parentPost, error: parentPostError } = await supabase
        .from('posts')
        .select('id, author_id, parent_post_id, root_post_id, depth')
        .eq('id', parentPostId)
        .maybeSingle();

      if (parentPostError) {
        throw new BadRequestException(parentPostError.message);
      }

      if (!parentPost) {
        throw new BadRequestException(POST_ERROR.PARENT_COMMENT_NOT_FOUND);
      }

      replyTargetForNotification = {
        id: parentPost.id,
        author_id: parentPost.author_id,
        parent_post_id: parentPost.parent_post_id,
        root_post_id: parentPost.root_post_id,
        depth: parentPost.depth,
      };

      const belongsToThisPost =
        parentPost.root_post_id === postId ||
        parentPost.parent_post_id === postId;

      if (!belongsToThisPost) {
        throw new BadRequestException(
          POST_ERROR.PARENT_COMMENT_NOT_BELONG_TO_POST,
        );
      }
      // kiểm tra parent comment phải là comment hoặc reply chứ không được là post gốc hay dữ liệu bất thường
      if (
        parentPost.depth !== POST_DEPTH.COMMENT &&
        parentPost.depth !== POST_DEPTH.REPLY
      ) {
        throw new BadRequestException(POST_ERROR.INVALID_PARENT_COMMENT_DEPTH);
      }

      parentPostIdToSave =
        parentPost.depth === POST_DEPTH.COMMENT
          ? parentPost.id
          : (parentPost.parent_post_id as string);

      rootPostIdToSave = postId;
      depth = POST_DEPTH.REPLY;
    }

    const { data: createdComment, error: createCommentError } = await supabase
      .from('posts')
      .insert({
        author_id: userId,
        content,
        media,
        visibility: POST_VISIBILITY.PUBLIC,
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

    if (createdComment) {
      const createdCommentId = createdComment.id;

      if (depth === POST_DEPTH.COMMENT) {
        await this.notificationsService.createNotification({
          recipientId: rootPost.author_id,
          actorId: userId,
          type: POST_NOTIFICATION_TYPE.COMMENT_POST,
          targetPostId: postId,
          targetCommentId: createdCommentId,
          groupKey: POST_NOTIFICATION_GROUP_KEY.commentPost(postId),
        });
      }

      if (depth === POST_DEPTH.REPLY && replyTargetForNotification) {
        const shouldNotifyPostOwner =
          rootPost.author_id !== replyTargetForNotification.author_id;

        if (shouldNotifyPostOwner) {
          await this.notificationsService.createNotification({
            recipientId: rootPost.author_id,
            actorId: userId,
            type: POST_NOTIFICATION_TYPE.COMMENT_POST,
            targetPostId: postId,
            targetCommentId: parentPostIdToSave,
            targetReplyId: createdCommentId,
            groupKey: POST_NOTIFICATION_GROUP_KEY.commentPost(postId),
          });
        }

        await this.notificationsService.createNotification({
          recipientId: replyTargetForNotification.author_id,
          actorId: userId,
          type: POST_NOTIFICATION_TYPE.REPLY_COMMENT,
          targetPostId: postId,
          targetCommentId: parentPostIdToSave,
          targetReplyId: createdCommentId,
          groupKey: POST_NOTIFICATION_GROUP_KEY.replyComment(
            replyTargetForNotification.id,
          ),
          metadata: {
            repliedToId: replyTargetForNotification.id,
          },
        });
      }
    }

    const [enrichedComment] = await this.attachViewerPostStatus(
      createdComment ? [createdComment] : [],
      userId,
    );

    return { comment: enrichedComment };
  }

  async getComments(postId: string, authHeader?: string) {
    if (!postId) {
      throw new BadRequestException(POST_ERROR.MISSING_POST_ID);
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
      throw new BadRequestException(POST_ERROR.NOT_FOUND);
    }

    const { data: comments, error: commentsError } = await supabase
      .from('posts')
      .select(POST_WITH_AUTHOR_SELECT)
      .eq('root_post_id', postId)
      .in('depth', [POST_DEPTH.COMMENT, POST_DEPTH.REPLY])
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
      .filter((comment) => comment.depth === POST_DEPTH.COMMENT)
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

  async sharePost(userId: string, postId: string, body: SharePostDto) {
    const content = body.content?.trim() ?? '';
    const visibility = body.visibility ?? POST_VISIBILITY.PUBLIC;

    const { data: targetPostData, error: targetPostError } = await supabase
      .from('posts')
      .select('id,author_id, shared_post_id, was_shared_post, depth')
      .eq('id', postId)
      .maybeSingle();

    const targetPostRow = targetPostData as Record<string, unknown> | null;

    const targetPost: ShareTargetPost | null = targetPostRow
      ? {
          id: typeof targetPostRow.id === 'string' ? targetPostRow.id : '',
          author_id:
            typeof targetPostRow.author_id === 'string'
              ? targetPostRow.author_id
              : '',
          shared_post_id:
            typeof targetPostRow.shared_post_id === 'string'
              ? targetPostRow.shared_post_id
              : null,
          was_shared_post:
            typeof targetPostRow.was_shared_post === 'boolean'
              ? targetPostRow.was_shared_post
              : false,
          depth:
            typeof targetPostRow.depth === 'number'
              ? targetPostRow.depth
              : null,
        }
      : null;

    if (targetPostError) {
      throw new BadRequestException(targetPostError.message);
    }

    if (!targetPost || targetPost.depth !== 0) {
      throw new BadRequestException(POST_ERROR.NOT_FOUND);
    }

    if (!targetPost.id) {
      throw new BadRequestException(POST_ERROR.NOT_FOUND);
    }

    if (!targetPost.author_id) {
      throw new BadRequestException(POST_ERROR.POST_AUTHOR_NOT_FOUND);
    }

    if (targetPost.was_shared_post && !targetPost.shared_post_id) {
      throw new BadRequestException(
        POST_ERROR.ORIGINAL_SHARED_POST_NOT_AVAILABLE,
      );
    }

    const originalPostId = targetPost.shared_post_id ?? targetPost.id;

    const { data: sharedPost, error: createSharedPostError } = await supabase
      .from('posts')
      .insert({
        author_id: userId,
        content,
        media: null,
        visibility,
        parent_post_id: null,
        root_post_id: null,
        depth: POST_DEPTH.ROOT,
        likes_count: 0,
        comments_count: 0,
        shared_post_id: originalPostId,
        shares_count: 0,
        was_shared_post: true,
      })
      .select('*')
      .single();

    if (createSharedPostError || !sharedPost) {
      throw new BadRequestException(
        createSharedPostError?.message || POST_ERROR.SHARE_FAILED,
      );
    }

    const sharedPostRow = sharedPost as Record<string, unknown>;
    const sharedPostId =
      typeof sharedPostRow.id === 'string' ? sharedPostRow.id : '';

    if (!sharedPostId) {
      throw new BadRequestException(POST_ERROR.SHARE_FAILED);
    }

    const { error: createShareLogError } = await supabase
      .from('post_shares')
      .insert({
        original_post_id: originalPostId,
        shared_post_id: sharedPostId,
        user_id: userId,
      });

    if (createShareLogError) {
      throw new BadRequestException(createShareLogError.message);
    }

    const { data: originalPost, error: originalPostError } = await supabase
      .from('posts')
      .select('id, shares_count')
      .eq('id', originalPostId)
      .single();

    if (originalPostError || !originalPost) {
      throw new BadRequestException(
        originalPostError?.message || POST_ERROR.ORIGINAL_POST_NOT_FOUND,
      );
    }

    const originalPostRow = originalPost as Record<string, unknown>;
    const currentSharesCount =
      typeof originalPostRow.shares_count === 'number'
        ? originalPostRow.shares_count
        : 0;

    const { error: updateShareCountError } = await supabase
      .from('posts')
      .update({
        shares_count: currentSharesCount + 1,
      })
      .eq('id', originalPostId);

    if (updateShareCountError) {
      throw new BadRequestException(updateShareCountError.message);
    }

    let canRecipientViewSharedPost = visibility === POST_VISIBILITY.PUBLIC;

    if (visibility === POST_VISIBILITY.FOLLOWERS) {
      const { data: followRow, error: followError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', targetPost.author_id)
        .eq('following_id', userId)
        .maybeSingle();

      if (followError) {
        throw new BadRequestException(followError.message);
      }

      canRecipientViewSharedPost = !!followRow;
    }

    if (canRecipientViewSharedPost) {
      await this.notificationsService.createNotification({
        recipientId: targetPost.author_id,
        actorId: userId,
        type: POST_NOTIFICATION_TYPE.SHARE_POST,
        targetPostId: targetPost.id,
        sharePostId: sharedPostId,
        groupKey: POST_NOTIFICATION_GROUP_KEY.sharePost(targetPost.id),
        metadata: {
          sharePostId: sharedPostId,
          originalPostId,
        },
      });
    }

    return {
      message: POST_MESSAGE.SHARED,
      post: sharedPost,
    };
  }
}
