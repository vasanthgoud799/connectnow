# ConnectNow Call Test Checklist

## Browser matrix

- Chrome desktop -> Chrome desktop
- Chrome desktop -> Edge desktop
- Android Chrome -> Chrome desktop
- Android Chrome -> Edge desktop
- iPhone Safari -> Chrome desktop, if your deployed WebRTC flow is allowed by the current Safari version and permission model

## Network scenarios

- Same Wi-Fi network
- Different Wi-Fi networks
- Mobile data <-> Wi-Fi
- Mobile data <-> mobile data
- Network switch during active call: Wi-Fi to mobile data and back

## Direct call flows

- Outgoing audio call
- Incoming audio call
- Outgoing video call
- Incoming video call
- Caller ends call
- Receiver ends call
- Mute and unmute microphone during active call
- Turn camera off and back on during active call
- If supported on device, switch front and rear camera during active video call
- If camera fails, verify audio-only fallback
- If autoplay blocks audio, verify the "Tap to enable audio" recovery action

## Group call flows

- Start audio group call
- Start video group call
- Join existing audio group call
- Join existing video group call
- Participant joins after call already started
- Participant leaves during active call
- Host leaves call
- Multiple remote participants on different networks

## Permission failures

- Microphone denied before accepting call
- Camera denied before starting video call
- Camera denied while microphone allowed, verify audio-only fallback
- Browser-level blocked autoplay, verify recovery UI

## Recovery scenarios

- Reconnect after temporary network drop
- Reconnect after ICE restart
- Remote video arrives late while audio is already connected
- Browser tab backgrounded and returned to foreground

## Mobile QA notes

- Android Chrome portrait
- Android Chrome landscape
- iPhone Safari portrait
- iPhone Safari landscape
- Verify controls remain above browser chrome and safe-area inset
- Verify no horizontal overflow
- Verify local preview does not cover primary controls
