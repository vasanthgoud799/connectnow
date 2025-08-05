import React, { useRef, useEffect } from 'react';

const styles = {
  videoContainer: {
    width: '200px',
    height: '200px',
    borderRadius:'50px',
    position: 'absolute',
    top: '2%',
    right: '0%'
  },
  videoElement: {
    width: '100%',
    height: '100%'
  }
};

const LocalVideoView = props => {
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
    <div style={styles.videoContainer}>
      <video style={styles.videoElement} ref={localVideoRef} autoPlay muted={false} />
    </div>
  );
};

export default LocalVideoView;
