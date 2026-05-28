export type MessageItem = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export type ConversationUser = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type ConversationItem = {
  id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message: MessageItem | null;
  other_user: ConversationUser | null;
  has_unread: boolean;
};

export type GetConversationsResponse = {
  conversations: ConversationItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type GetMessagesResponse = {
  messages: MessageItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CreateConversationResponse = {
  conversation: ConversationItem;
};

export type SendMessageResponse = {
  message: MessageItem;
};

export type UnreadMessagesCountResponse = {
  unreadCount: number;
};

export type MessageNewSocketPayload = {
  message: MessageItem;
  conversation: ConversationItem;
};

export type ConversationUpdatedSocketPayload = {
  conversation: ConversationItem;
};

export type UnreadMessagesCountUpdatedSocketPayload = {
  unreadCount: number;
};
