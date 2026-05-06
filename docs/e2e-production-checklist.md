# ConnectNow E2E and Production Validation Checklist

## Automated coverage with Playwright

### Auth
- Sign in with the primary Clerk-backed test user.
- Verify the user lands on `/home`.
- Reload and verify session persistence.
- Logout and verify redirect to `/auth`.

### Chat and realtime
- Open an existing chat from the conversation list.
- Send a message and verify it renders after client-side decryption.
- Simulate a temporary offline period and verify the composer remains recoverable.
- Optional two-user coverage:
  - Sign in as the secondary test user in a separate browser context.
  - Open the primary contact thread.
  - Send a reply and verify it appears for the primary user.

### Media
- Open a chat.
- Attach a document through the attachment menu.
- Send the file.
- Verify the rendered media link uses `/api/media/access?token=...`.

### Trust model
- Open `/profile`.
- Verify the local security fingerprint is visible.
- Verify the copy-fingerprint control is enabled.

### Call UI
- Start an audio call from the chat header.
- Verify the direct call UI opens and exposes the end-call control.

## Manual WebRTC checklist

### Networks and device transitions
- Chrome on desktop Wi-Fi -> stay in call, then switch the same device to mobile hotspot.
- Android Chrome on mobile data -> lock screen briefly, foreground the app, and confirm media resumes.
- iPhone Safari if supported -> accept an incoming call after returning from background.
- Different networks -> caller on home Wi-Fi, callee on mobile data.
- Network loss -> disable network for 10-15 seconds, then re-enable and confirm reconnect/ICE recovery.

### Permissions and media behavior
- Deny microphone access and confirm a user-friendly error is shown.
- Deny camera access and confirm audio-only fallback works.
- Re-enable permissions and retry the call.
- Toggle mute/unmute and camera on/off during an active call.
- Verify remote audio remains audible after reconnect.

## Manual Redis and multi-instance checklist

### Horizontal scale
- Run two backend instances connected to the same Redis.
- Connect User A through instance 1 and User B through instance 2.
- Send direct messages both ways and verify delivery.
- Verify duplicate messages are not created after retries.
- Verify presence stays correct when one socket disconnects and reconnects on the other node.

### Group and call routing
- Start a group chat on instance 1 and receive messages on a participant attached to instance 2.
- Start a direct call where caller and callee are on different nodes.
- Verify offer, answer, and ICE candidate exchange succeeds cross-instance.
- End the call from each side and verify session cleanup on both nodes.

## Release recommendations
- Keep one stable primary and secondary Clerk test account for CI smoke runs.
- Run Playwright against a production-like preview URL with Redis enabled before public release.
- Treat manual WebRTC and cross-instance Redis checks as release gates, not optional spot checks.
