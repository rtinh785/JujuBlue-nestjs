export const MESSAGE_ERROR = {
  MISSING_RECEIVER_ID: 'Missing receiverId',
  MISSING_CONVERSATION_ID: 'Missing conversationId',
  MISSING_CONTENT: 'Message content is required',
  RECEIVER_NOT_FOUND: 'Receiver not found',
  CONVERSATION_NOT_FOUND: 'Conversation not found',
  NOT_CONVERSATION_PARTICIPANT:
    'You are not a participant of this conversation',
  CANNOT_MESSAGE_YOURSELF: 'You cannot message yourself',
  NOT_IMPLEMENTED: 'Not implemented',
} as const;

export const MESSAGE_SUCCESS = {
  CONVERSATION_MARKED_AS_READ: 'Conversation marked as read',
} as const;

export const MESSAGE_QUERY = {
  CONVERSATIONS_LIMIT: 20,
  MESSAGES_INITIAL_LIMIT: 20,
  MESSAGES_LOAD_MORE_LIMIT: 20,
} as const;

export const MESSAGE_SOCKET_EVENT = {
  NEW_MESSAGE: 'message:new',
  CONVERSATION_UPDATED: 'conversation:updated',
  UNREAD_COUNT_UPDATED: 'messages:unread-count-updated',
} as const;
