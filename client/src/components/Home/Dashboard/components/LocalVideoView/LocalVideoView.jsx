import React, { useRef, useEffect } from "react";

const LocalVideoView = (props) => {
  const { localStream } = props;
  const localVideoRef = useRef();

  useEffect(() => {
    if (localStream) {
      const localVideo = localVideoRef.current;
      localVideo.srcObject = localStream;

      localVideo.onloadedmetadata = () => {
        localVideo.play();
      };
    }
  }, [localStream]);

  return (
    <div className="absolute bottom-8 right-8 h-44 w-32 overflow-hidden rounded-[28px] border border-white/10 bg-[#050814]/80 shadow-[0_20px_50px_rgba(0,0,0,0.45)] sm:h-52 sm:w-40">
      <video
        className="h-full w-full object-cover"
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-xs text-white">
        <span>You</span>
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </div>
    </div>
  );
};

export default LocalVideoView;
