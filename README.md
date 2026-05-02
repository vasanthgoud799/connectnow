# ConnectNow

ConnectNow is a full-stack real-time messaging platform focused on modern chat UX, private media sharing, live calling, AI-assisted messaging, and mobile-friendly behavior. It combines direct chats, groups, encrypted messaging, private media delivery, scheduling, and social features in one app.

## Highlights

- Real-time 1-to-1 messaging with delivery and seen states
- Group chats with rich member management
- End-to-end encrypted text, polls, captions, and private media flows
- Private media storage with Supabase signed URLs
- Audio calls, video calls, and group calling
- Polls, reactions, replies, forwards, pinning, starring, editing, and delete flows
- AI-powered smart replies, summaries, rewrite, translation, and tone suggestions
- Clerk authentication with backend session sync
- PWA-ready installable client
- Adaptive mobile chat navigation similar to native messaging apps
- Notifications, scheduled messages, and birthday reminders

## Feature Set

### Messaging

- Direct chat and group chat
- Message reply threads
- Message forwarding
- Delivery and read receipts
- Edit message
- Delete for me / delete for everyone
- Reactions
- Pinned messages
- Starred messages
- Search inside conversation
- Global search

### Media

- Image, video, audio, voice note, and document sharing
- Private media URLs via signed access
- Shared media, docs, and links panels
- Fullscreen preview for media
- Mobile-friendly attachment previews

### Encryption

- Web Crypto API based E2EE
- RSA-OAEP and ECDH based key flows
- AES-GCM payload encryption
- Browser-side key generation
- Private keys stored only on the client device
- Server stores ciphertext instead of plaintext for encrypted payloads

### Calling

- Direct audio call
- Direct video call
- Group calling
- Live participant status
- Incoming/outgoing call states
- Mobile-friendly call UI

### AI Features

- Smart replies
- Chat summary
- Rewrite tone
- Translation
- Autocomplete and tone suggestions

### Social / Productivity

- Friend-based messaging permissions
- Block / unblock
- Remove friend
- Group creation and member management
- Scheduled messages
- Birthday reminders and birthday message workflows
- Notifications drawer with mark-as-read support

### UX / Platform

- PWA installability
- Mobile-first adaptive chat navigation
- Desktop split-view layout
- Theming support
- Optimistic media sending and cached decrypt flows

## Tech Stack

### Frontend

- React 18
- Vite
- React Router
- Tailwind CSS
- Framer Motion
- Zustand
- Redux + Redux Persist
- Socket.IO Client
- Clerk
- Sonner
- Emoji Picker

### Backend

- Node.js
- Express
- Socket.IO
- MongoDB + Mongoose
- JWT cookies
- Multer
- Nodemailer
- Node Schedule

### Realtime / Media / Security

- WebRTC
- Web Crypto API
- Supabase Storage
- Signed media URLs

### AI / External Services

- OpenAI SDK
- Clerk authentication
- Supabase storage

## Project Structure

```text
connectnow/
|-- client/                  # React + Vite frontend
|   |-- src/
|   |   |-- components/      # UI and app features
|   |   |-- context/         # socket/message handlers
|   |   |-- crypto/          # E2EE key and message logic
|   |   |-- lib/             # API client helpers
|   |   |-- store/           # Zustand + Redux state
|   |   `-- utils/           # routes, WebRTC, helpers
|-- server/                  # Express + Socket.IO backend
|   |-- controllers/
|   |-- middlewares/
|   |-- models/
|   |-- routes/
|   |-- services/
|   `-- socket.js
`-- README.md
```

## How It Works

### Authentication

- Clerk handles sign-in/sign-up
- The frontend syncs authenticated Clerk users into the backend
- The backend maintains its own session/JWT cookie for app APIs and sockets

### Messaging Flow

- Client sends messages through Socket.IO
- Backend persists messages in MongoDB
- Socket events update active chats in real time
- Delivery and seen states are synchronized to both sides

### Encryption Flow

- Keys are generated on the client
- Public keys are uploaded to the server
- Private keys stay on the device
- Text and protected payloads are encrypted before leaving the browser
- Decryption happens client-side when messages are read

### Media Flow

- Media is uploaded to storage
- Signed/private access is resolved by the backend
- Encrypted/private payload metadata is associated with messages
- Shared media views and previews are hydrated client-side

## Local Setup

### Prerequisites

- Node.js 18+
- MongoDB
- Supabase project and storage bucket
- Clerk project

### 1. Clone

```bash
git clone https://github.com/your-username/connectnow.git
cd connectnow
```

### 2. Install dependencies

```bash
cd client
npm install

cd ../server
npm install
```

### 3. Environment variables

Create:

- `client/.env`
- `server/.env`

Example client env:

```env
VITE_SERVER_URL=http://localhost:8747
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

Example server env:

```env
PORT=8747
ORIGIN=http://localhost:5173
DATABASE_URL=your_mongodb_connection_string
JWT_KEY=your_jwt_secret

CLERK_SECRET_KEY=your_clerk_secret_key

SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_STORAGE_BUCKET=chat-media

OPENAI_API_KEY=your_openai_api_key
```

Add any extra mail/payment/provider envs your deployment uses.

### 4. Run the app

Frontend:

```bash
cd client
npm run dev
```

Backend:

```bash
cd server
npm start
```

Client default:

- [http://localhost:5173](http://localhost:5173)

Server default:

- [http://localhost:8747](http://localhost:8747)

## Available Scripts

### Client

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

### Server

```bash
npm start
```

## Deployment Notes

Recommended stack:

- Frontend: Vercel
- Backend: Render / Railway
- Database: MongoDB Atlas
- Storage: Supabase
- Auth: Clerk

Important before production:

- switch Clerk development keys to production keys
- rotate any exposed secrets
- configure CORS and cookie settings for your deployed frontend domain
- keep Supabase media bucket and signed URL flow aligned with your privacy model

## Current Status

Implemented:

- real-time chat
- private media
- E2EE foundations
- direct and group calling
- PWA setup
- adaptive mobile layout
- AI messaging workflows

Temporarily disabled:

- premium checkout flow currently shows `Coming soon` until Razorpay keys are ready

## Performance Work Already Added

- staged chat rendering instead of blocking on full decryption
- cached decrypt results on device
- non-blocking media hydration
- optimistic media-send behavior improvements
- lighter chat/message fetch paths

## Roadmap

- resumable/chunked large uploads
- background workers for heavy crypto and media processing
- deeper media compression pipeline
- richer analytics/admin tooling
- production payment activation
- multi-device key recovery / better E2EE portability

## Screens / Experience Summary

ConnectNow is designed to feel like a modern messaging product:

- WhatsApp-like mobile chat navigation
- desktop split-pane workspace
- live presence
- premium-style dark UI
- fast media-driven conversations

## License

This project is currently private/personal unless you add a license file.
