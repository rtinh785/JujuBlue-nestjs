import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MESSAGE_SOCKET_EVENT } from '@/core/constants/message.constant';
import { getUserId } from '@/helpers/getUserId';
import {
  ConversationUpdatedSocketPayload,
  MessageNewSocketPayload,
  UnreadMessagesCountUpdatedSocketPayload,
} from '@/types/message.type';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  async handleConnection(client: Socket) {
    try {
      const token = this.getTokenFromSocket(client);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const userId = await getUserId(`Bearer ${token}`);

      await client.join(this.getUserRoom(userId));
    } catch {
      client.disconnect(true);
    }
  }

  emitNewMessage(userId: string, payload: MessageNewSocketPayload) {
    this.server
      .to(this.getUserRoom(userId))
      .emit(MESSAGE_SOCKET_EVENT.NEW_MESSAGE, payload);
  }

  emitConversationUpdated(
    userId: string,
    payload: ConversationUpdatedSocketPayload,
  ) {
    this.server
      .to(this.getUserRoom(userId))
      .emit(MESSAGE_SOCKET_EVENT.CONVERSATION_UPDATED, payload);
  }

  emitUnreadCountUpdated(
    userId: string,
    payload: UnreadMessagesCountUpdatedSocketPayload,
  ) {
    this.server
      .to(this.getUserRoom(userId))
      .emit(MESSAGE_SOCKET_EVENT.UNREAD_COUNT_UPDATED, payload);
  }

  private getUserRoom(userId: string) {
    return `user:${userId}`;
  }

  private getTokenFromSocket(client: Socket) {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    const authToken = typeof auth?.token === 'string' ? auth.token : '';
    const authorization = client.handshake.headers.authorization;
    const headerToken =
      typeof authorization === 'string'
        ? authorization.replace('Bearer ', '')
        : '';

    return authToken || headerToken;
  }
}
