# JujuBlue Backend

JujuBlue Backend là REST API và realtime server cho dự án JujuBlue, một mini social platform mô phỏng các chức năng cốt lõi của mạng xã hội như authentication, profile, post, follow, notification, search và realtime messaging.

Backend được xây dựng bằng NestJS, TypeScript, Supabase/PostgreSQL và Socket.IO. Project hiện sử dụng Supabase client để thao tác database, đồng thời generate TypeScript types từ Supabase để tăng độ an toàn khi query dữ liệu.

## Tech Stack

- NestJS 11
- TypeScript
- Supabase JavaScript Client
- PostgreSQL via Supabase
- Socket.IO
- class-validator
- Jest
- pnpm

## Main Features

- Authentication-related API flow.
- User profile APIs.
- Follow / unfollow APIs.
- Post APIs.
- Notification APIs.
- Search APIs.
- Realtime messaging APIs.
- Socket.IO gateway for realtime message delivery.
- Supabase generated database types.
- Cursor-based pagination for message-related data.

## Project Structure

```bash
src/
├── core/              # Config, constants and shared core files
├── libs/              # External service clients, for example Supabase
├── modules/           # Feature modules
│   ├── auth/
│   ├── follows/
│   ├── messages/
│   ├── notifications/
│   ├── posts/
│   ├── profiles/
│   └── search/
├── types/             # Generated/shared TypeScript types
├── app.module.ts
└── main.ts
```

## Requirements

- Node.js
- pnpm
- Supabase project
- JujuBlue frontend running locally for full app testing

## Environment Variables

Create a `.env` file in the project root.

```env
DATABASE_URL=""
DIRECT_URL=""
SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""
```

Notes:

- `SUPABASE_URL` is the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` is used only on the backend. Do not expose it to the frontend.
- `DATABASE_URL` and `DIRECT_URL` are used for Supabase type generation / database tooling.
- Do not commit real environment values.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm run start:dev
```

The API usually runs at:

```bash
http://localhost:4000
```

## Available Scripts

```bash
pnpm run start
```

Run the NestJS server.

```bash
pnpm run start:dev
```

Run the server in watch mode.

```bash
pnpm run build
```

Compile the project.

```bash
pnpm run start:prod
```

Run the compiled production build from `dist`.

```bash
pnpm run lint
```

Run ESLint and auto-fix issues.

```bash
pnpm run format
```

Format source and test files with Prettier.

```bash
pnpm run gen:types
```

Generate Supabase database types into `src/types/database.types.tmp.ts`.

After generating types, copy the generated file into the active database types file if needed:

```bash
copy src\types\database.types.tmp.ts src\types\database.types.ts
```

## Messages Flow

The message feature uses both REST API and Socket.IO.

REST API handles:

- Creating or getting a direct conversation.
- Fetching conversation list.
- Fetching messages in a conversation.
- Sending a message.
- Marking a conversation as read.
- Getting unread conversation count.

Socket.IO handles:

- Joining user-specific realtime channels.
- Emitting new messages to online users.
- Updating frontend state without requiring manual refresh.

Main database tables for messages:

- `conversations`
- `conversation_participants`
- `messages`

Unread state is calculated by comparing the latest message timestamp with each participant's `last_read_at`.

## API Documentation

Swagger/OpenAPI is not configured yet.

If API documentation is added later, the recommended route is:

```bash
http://localhost:4000/api-docs
```

## Frontend Repository

This backend is designed to work with the JujuBlue Next.js frontend. The frontend handles UI, TanStack Query cache, realtime message updates and full viewport message layout.

## Current Status

The project is currently developed and tested locally. Deployment is not configured yet.
