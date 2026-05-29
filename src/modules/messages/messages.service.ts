import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MESSAGE_ERROR,
  MESSAGE_QUERY,
  MESSAGE_SUCCESS,
} from '@/core/constants/message.constant';
import { supabase } from '@/libs/supabase/supabase';
import {
  ConversationItem,
  ConversationUser,
  CreateConversationResponse,
  GetConversationsResponse,
  GetMessagesResponse,
  MessageItem,
  SendMessageResponse,
  UnreadMessagesCountResponse,
} from '@/types/message.type';
import { MessagesGateway } from './messages.gateway';

type ParticipantRow = {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
};

type ConversationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_id: string | null;
};

@Injectable()
export class MessagesService {
  constructor(private readonly messagesGateway: MessagesGateway) {}

  async getConversations(
    userId: string,
    query?: {
      cursor?: string;
      limit?: string;
    },
  ): Promise<GetConversationsResponse> {
    const { data: myParticipants, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, last_read_at')
      .eq('user_id', userId);

    if (participantsError) {
      throw new BadRequestException(participantsError.message);
    }

    const conversationIds = (myParticipants ?? []).map(
      (participant) => participant.conversation_id,
    );

    if (conversationIds.length === 0) {
      return {
        conversations: [],
        nextCursor: null,
        hasMore: false,
      };
    }

    const parsedLimit = Number(query?.limit);
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MESSAGE_QUERY.CONVERSATIONS_LIMIT)
        : MESSAGE_QUERY.CONVERSATIONS_LIMIT;

    let conversationsQuery = supabase
      .from('conversations')
      .select('id, created_at, updated_at, last_message_at, last_message_id')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(limit + 1);

    if (query?.cursor) {
      conversationsQuery = conversationsQuery.lt('updated_at', query.cursor);
    }

    const { data: conversations, error: conversationsError } =
      await conversationsQuery;

    if (conversationsError) {
      throw new BadRequestException(conversationsError.message);
    }

    const rawConversations = conversations ?? [];
    const limitedConversations = rawConversations.slice(0, limit);
    const limitedConversationIds = limitedConversations.map(
      (conversation) => conversation.id,
    );
    const lastConversation =
      limitedConversations[limitedConversations.length - 1] ?? null;

    const [participantsMap, messagesMap] = await Promise.all([
      this.getParticipantsMap(limitedConversationIds),
      this.getLastMessagesMap(limitedConversations),
    ]);

    const otherUserIds = limitedConversations
      .map((conversation) =>
        this.getOtherParticipant(participantsMap, conversation.id, userId),
      )
      .filter((participant): participant is ParticipantRow =>
        Boolean(participant),
      )
      .map((participant) => participant.user_id);

    const usersMap = await this.getUsersMap(otherUserIds);
    const myParticipantsMap = new Map(
      (myParticipants ?? []).map((participant) => [
        participant.conversation_id,
        participant,
      ]),
    );

    return {
      conversations: limitedConversations.map((conversation) => {
        const lastMessage = conversation.last_message_id
          ? (messagesMap.get(conversation.last_message_id) ?? null)
          : null;
        const otherParticipant = this.getOtherParticipant(
          participantsMap,
          conversation.id,
          userId,
        );
        const myParticipant = myParticipantsMap.get(conversation.id) ?? null;

        return this.toConversationItem({
          conversation,
          lastMessage,
          otherUser: otherParticipant
            ? (usersMap.get(otherParticipant.user_id) ?? null)
            : null,
          myLastReadAt: myParticipant?.last_read_at ?? null,
          userId,
        });
      }),
      nextCursor: lastConversation?.updated_at ?? null,
      hasMore: rawConversations.length > limit,
    };
  }

  async getUnreadCount(userId: string): Promise<UnreadMessagesCountResponse> {
    const { data: myParticipants, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, last_read_at')
      .eq('user_id', userId);

    if (participantsError) {
      throw new BadRequestException(participantsError.message);
    }

    const conversationIds = (myParticipants ?? []).map(
      (participant) => participant.conversation_id,
    );

    if (conversationIds.length === 0) {
      return { unreadCount: 0 };
    }

    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id, last_message_id')
      .in('id', conversationIds)
      .not('last_message_id', 'is', null);

    if (conversationsError) {
      throw new BadRequestException(conversationsError.message);
    }

    const lastMessageIds = (conversations ?? [])
      .map((conversation) => conversation.last_message_id)
      .filter((messageId): messageId is string => Boolean(messageId));

    if (lastMessageIds.length === 0) {
      return { unreadCount: 0 };
    }

    const { data: lastMessages, error: lastMessagesError } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .in('id', lastMessageIds);

    if (lastMessagesError) {
      throw new BadRequestException(lastMessagesError.message);
    }

    const myParticipantsMap = new Map(
      (myParticipants ?? []).map((participant) => [
        participant.conversation_id,
        participant,
      ]),
    );

    const unreadCount = (lastMessages ?? []).filter((message) => {
      const myParticipant = myParticipantsMap.get(message.conversation_id);

      return this.isUnreadMessage({
        lastMessage: message,
        myLastReadAt: myParticipant?.last_read_at ?? null,
        userId,
      });
    }).length;

    return { unreadCount };
  }

  async createOrGetConversation(
    userId: string,
    receiverId?: string,
  ): Promise<CreateConversationResponse> {
    if (!receiverId) {
      throw new BadRequestException(MESSAGE_ERROR.MISSING_RECEIVER_ID);
    }

    if (receiverId === userId) {
      throw new BadRequestException(MESSAGE_ERROR.CANNOT_MESSAGE_YOURSELF);
    }

    await this.ensureUserExists(receiverId);

    const existingConversationId = await this.findDirectConversationId(
      userId,
      receiverId,
    );

    if (existingConversationId) {
      return {
        conversation: await this.getConversationById(
          userId,
          existingConversationId,
        ),
      };
    }

    const now = new Date().toISOString();

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        updated_at: now,
      })
      .select('id')
      .single();

    if (conversationError) {
      throw new BadRequestException(conversationError.message);
    }

    const { error: participantsError } = await supabase
      .from('conversation_participants')
      .insert([
        {
          conversation_id: conversation.id,
          user_id: userId,
          last_read_at: now,
        },
        {
          conversation_id: conversation.id,
          user_id: receiverId,
          last_read_at: null,
        },
      ]);

    if (participantsError) {
      throw new BadRequestException(participantsError.message);
    }

    return {
      conversation: await this.getConversationById(userId, conversation.id),
    };
  }

  async getMessages(
    userId: string,
    conversationId: string,
    query?: {
      cursor?: string;
      limit?: string;
    },
  ): Promise<GetMessagesResponse> {
    if (!conversationId) {
      throw new BadRequestException(MESSAGE_ERROR.MISSING_CONVERSATION_ID);
    }

    await this.ensureConversationParticipant(userId, conversationId);

    const parsedLimit = Number(query?.limit);
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MESSAGE_QUERY.MESSAGES_LOAD_MORE_LIMIT)
        : MESSAGE_QUERY.MESSAGES_INITIAL_LIMIT;

    let messagesQuery = supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (query?.cursor) {
      messagesQuery = messagesQuery.lt('created_at', query.cursor);
    }

    const { data, error } = await messagesQuery;

    if (error) {
      throw new BadRequestException(error.message);
    }

    const rawMessages = data ?? [];
    const paginatedMessages = rawMessages.slice(0, limit);
    const lastMessage = paginatedMessages[paginatedMessages.length - 1] ?? null;

    return {
      messages: [...paginatedMessages].reverse(),
      nextCursor: lastMessage?.created_at ?? null,
      hasMore: rawMessages.length > limit,
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    content?: string,
  ): Promise<SendMessageResponse> {
    if (!conversationId) {
      throw new BadRequestException(MESSAGE_ERROR.MISSING_CONVERSATION_ID);
    }

    const trimmedContent = content?.trim() ?? '';

    if (!trimmedContent) {
      throw new BadRequestException(MESSAGE_ERROR.MISSING_CONTENT);
    }

    await this.ensureConversationParticipant(userId, conversationId);

    const { data: message, error: createMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content: trimmedContent,
      })
      .select('id, conversation_id, sender_id, content, created_at')
      .single();

    if (createMessageError) {
      throw new BadRequestException(createMessageError.message);
    }

    const { error: updateConversationError } = await supabase
      .from('conversations')
      .update({
        last_message_id: message.id,
        last_message_at: message.created_at,
        updated_at: message.created_at,
      })
      .eq('id', conversationId);

    if (updateConversationError) {
      throw new BadRequestException(updateConversationError.message);
    }

    const { error: updateReadError } = await supabase
      .from('conversation_participants')
      .update({
        last_read_at: message.created_at,
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (updateReadError) {
      throw new BadRequestException(updateReadError.message);
    }

    await this.emitMessageCreatedEvents(conversationId, message);

    return { message };
  }

  async markConversationRead(
    userId: string,
    conversationId: string,
  ): Promise<{ message: string }> {
    if (!conversationId) {
      throw new BadRequestException(MESSAGE_ERROR.MISSING_CONVERSATION_ID);
    }

    await this.ensureConversationParticipant(userId, conversationId);

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('last_message_id')
      .eq('id', conversationId)
      .single();

    if (conversationError) {
      throw new BadRequestException(conversationError.message);
    }

    let lastReadAt = new Date().toISOString();

    if (conversation.last_message_id) {
      const { data: lastMessage, error: lastMessageError } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', conversation.last_message_id)
        .single();

      if (lastMessageError) {
        throw new BadRequestException(lastMessageError.message);
      }

      lastReadAt = lastMessage.created_at;
    }

    const { error } = await supabase
      .from('conversation_participants')
      .update({
        last_read_at: lastReadAt,
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    await this.emitConversationReadEvents(userId, conversationId);

    return {
      message: MESSAGE_SUCCESS.CONVERSATION_MARKED_AS_READ,
    };
  }

  private async emitMessageCreatedEvents(
    conversationId: string,
    message: MessageItem,
  ) {
    const participantIds =
      await this.getConversationParticipantIds(conversationId);

    await Promise.all(
      participantIds.map(async (participantId) => {
        const [conversation, unreadCountResponse] = await Promise.all([
          this.getConversationById(participantId, conversationId),
          this.getUnreadCount(participantId),
        ]);

        this.messagesGateway.emitNewMessage(participantId, {
          message,
          conversation,
        });
        this.messagesGateway.emitUnreadCountUpdated(participantId, {
          unreadCount: unreadCountResponse.unreadCount,
        });
      }),
    );
  }

  private async emitConversationReadEvents(
    userId: string,
    conversationId: string,
  ) {
    const [conversation, unreadCountResponse] = await Promise.all([
      this.getConversationById(userId, conversationId),
      this.getUnreadCount(userId),
    ]);

    this.messagesGateway.emitConversationUpdated(userId, { conversation });
    this.messagesGateway.emitUnreadCountUpdated(userId, {
      unreadCount: unreadCountResponse.unreadCount,
    });
  }

  private async getConversationById(
    userId: string,
    conversationId: string,
  ): Promise<ConversationItem> {
    await this.ensureConversationParticipant(userId, conversationId);

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, created_at, updated_at, last_message_at, last_message_id')
      .eq('id', conversationId)
      .single();

    if (conversationError) {
      throw new BadRequestException(conversationError.message);
    }

    const participantsMap = await this.getParticipantsMap([conversationId]);
    const myParticipant =
      participantsMap
        .get(conversationId)
        ?.find((participant) => participant.user_id === userId) ?? null;
    const otherParticipant = this.getOtherParticipant(
      participantsMap,
      conversationId,
      userId,
    );
    const usersMap = await this.getUsersMap(
      otherParticipant ? [otherParticipant.user_id] : [],
    );
    const messagesMap = await this.getLastMessagesMap([conversation]);
    const lastMessage = conversation.last_message_id
      ? (messagesMap.get(conversation.last_message_id) ?? null)
      : null;

    return this.toConversationItem({
      conversation,
      lastMessage,
      otherUser: otherParticipant
        ? (usersMap.get(otherParticipant.user_id) ?? null)
        : null,
      myLastReadAt: myParticipant?.last_read_at ?? null,
      userId,
    });
  }

  private async ensureConversationParticipant(
    userId: string,
    conversationId: string,
  ): Promise<ParticipantRow> {
    const { data, error } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, last_read_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new BadRequestException(MESSAGE_ERROR.NOT_CONVERSATION_PARTICIPANT);
    }

    return data;
  }

  private async getConversationParticipantIds(
    conversationId: string,
  ): Promise<string[]> {
    const { data, error } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []).map((participant) => participant.user_id);
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new BadRequestException(MESSAGE_ERROR.RECEIVER_NOT_FOUND);
    }
  }

  private async findDirectConversationId(
    userId: string,
    receiverId: string,
  ): Promise<string | null> {
    const { data: myParticipants, error: myParticipantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    if (myParticipantsError) {
      throw new BadRequestException(myParticipantsError.message);
    }

    const myConversationIds = (myParticipants ?? []).map(
      (participant) => participant.conversation_id,
    );

    if (myConversationIds.length === 0) {
      return null;
    }

    const { data: receiverParticipants, error: receiverParticipantsError } =
      await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', receiverId)
        .in('conversation_id', myConversationIds)
        .limit(1);

    if (receiverParticipantsError) {
      throw new BadRequestException(receiverParticipantsError.message);
    }

    return receiverParticipants?.[0]?.conversation_id ?? null;
  }

  private async getParticipantsMap(
    conversationIds: string[],
  ): Promise<Map<string, ParticipantRow[]>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const { data, error } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, last_read_at')
      .in('conversation_id', conversationIds);

    if (error) {
      throw new BadRequestException(error.message);
    }

    const participantsMap = new Map<string, ParticipantRow[]>();

    for (const participant of data ?? []) {
      const currentParticipants =
        participantsMap.get(participant.conversation_id) ?? [];

      currentParticipants.push(participant);
      participantsMap.set(participant.conversation_id, currentParticipants);
    }

    return participantsMap;
  }

  private async getLastMessagesMap(
    conversations: Pick<ConversationRow, 'last_message_id'>[],
  ): Promise<Map<string, MessageItem>> {
    const messageIds = conversations
      .map((conversation) => conversation.last_message_id)
      .filter((messageId): messageId is string => Boolean(messageId));

    if (messageIds.length === 0) {
      return new Map();
    }

    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .in('id', messageIds);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return new Map((data ?? []).map((message) => [message.id, message]));
  }

  private async getUsersMap(
    userIds: string[],
  ): Promise<Map<string, ConversationUser>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const uniqueUserIds = [...new Set(userIds)];

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', uniqueUserIds);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return new Map((data ?? []).map((user) => [user.id, user]));
  }

  private getOtherParticipant(
    participantsMap: Map<string, ParticipantRow[]>,
    conversationId: string,
    userId: string,
  ): ParticipantRow | null {
    return (
      participantsMap
        .get(conversationId)
        ?.find((participant) => participant.user_id !== userId) ?? null
    );
  }

  private toConversationItem({
    conversation,
    lastMessage,
    otherUser,
    myLastReadAt,
    userId,
  }: {
    conversation: ConversationRow;
    lastMessage: MessageItem | null;
    otherUser: ConversationUser | null;
    myLastReadAt: string | null;
    userId: string;
  }): ConversationItem {
    return {
      id: conversation.id,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      last_message_at: conversation.last_message_at,
      last_message: lastMessage,
      other_user: otherUser,
      has_unread: this.isUnreadMessage({
        lastMessage,
        myLastReadAt,
        userId,
      }),
    };
  }

  private isUnreadMessage({
    lastMessage,
    myLastReadAt,
    userId,
  }: {
    lastMessage: MessageItem | null;
    myLastReadAt: string | null;
    userId: string;
  }) {
    return (
      !!lastMessage &&
      lastMessage.sender_id !== userId &&
      (!myLastReadAt ||
        new Date(lastMessage.created_at).getTime() >
          new Date(myLastReadAt).getTime())
    );
  }
}
