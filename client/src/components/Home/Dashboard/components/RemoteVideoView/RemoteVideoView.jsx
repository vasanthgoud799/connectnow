import { useRef, useEffect } from "react";

const RemoteVideoView = (props) => {
  const { remoteStream } = props;
  const remoteVideoRef = useRef();
  const remoteAudioRef = useRef();

  useEffect(() => {
    if (remoteStream) {
      const remoteVideo = remoteVideoRef.current;
      const remoteAudio = remoteAudioRef.current;
      remoteVideo.srcObject = remoteStream;
      if (remoteAudio) {
        remoteAudio.srcObject = remoteStream;
        remoteAudio.play().catch(() => {});
      }

      remoteVideo.onloadedmetadata = () => {
        remoteVideo.play().catch(() => {});
      };
    }
  }, [remoteStream]);

  return (
    <div className="h-full w-full">
      <audio ref={remoteAudioRef} autoPlay />
      <video
        className="h-full w-full object-cover"
        ref={remoteVideoRef}
        autoPlay
        playsInline
      />
    </div>
  );
};

export default RemoteVideoView;
