import React, { useState, useRef, useEffect } from 'react';
import { FaMicrophoneSlash, FaMicrophone, FaVideoSlash, FaVideo, FaPhoneSlash } from 'react-icons/fa';
import { MdCallEnd } from 'react-icons/md';
import { hangUp } from '@utils/webRTC/webRTCHandler';
import { toast } from 'sonner';
import './CallingDialog.css'; // Importing the CSS file

const styles = {
  buttonContainer: {
    marginTop: '10px',
    width: '40px',
    height: '40px',
    borderRadius: '40px',
    border: '2px solid #e6e5e8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};

const CallingDialog = ({ onClose }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    // Get the user's media (audio and video)
    const getUserMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing media devices.', error);
        toast.error("Could not access media devices. Please check your permissions.");
      }
    };

    getUserMedia();
  }, []);

  const toggleMute = () => {
    if (videoRef.current) {
      const stream = videoRef.current.srcObject;
      const audioTrack = stream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!isMuted);
      toast.success(`Audio ${!isMuted ? 'muted' : 'unmuted'}`);
    }
  };

  const toggleVideo = () => {
    if (videoRef.current) {
      const stream = videoRef.current.srcObject;
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!isVideoOff);
      toast.success(`Video ${!isVideoOff ? 'turned off' : 'turned on'}`);
    }
  };

  const handleHangUpButtonPressed = () => {
    hangUp();
    // onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-transparent  z-50">
      <div className="relative bg-gray-900 text-white rounded-lg shadow-xl w-[800px] h-[500px] p-6 flex flex-col gap-6">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-900 hover:text-white z-10 hover:bg-gray-500 transition-colors duration-300 ease-in-out"
          aria-label="Close Video Dialog"
        >
          ✖
        </button>

        <div className="flex-grow bg-gray-800 rounded-lg flex items-center justify-center relative overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted={isMuted}
            className="w-full h-full object-cover rounded-lg transition-opacity duration-300 ease-in-out"
          ></video>
          {isVideoOff && (
            <span className="absolute text-gray-400 text-xl transition-opacity duration-300 ease-in-out">
              Video is off
            </span>
          )}
        </div>

        <div className="flex justify-center space-x-6">
          <button
            onClick={handleHangUpButtonPressed}
            className="bg-red-600 hover:bg-red-700 text-white py-3 px-6 rounded-full transition-transform duration-300 ease-in-out transform hover:scale-110 flex items-center justify-center"
            aria-label="End Call"
          >
            <FaPhoneSlash className="text-2xl" />
          </button>

          <button
            onClick={toggleMute}
            className="bg-gray-600 hover:bg-gray-700 text-white py-3 px-6 rounded-full transition-transform duration-300 ease-in-out transform hover:scale-110 flex items-center justify-center"
            aria-label={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? <FaMicrophoneSlash className="text-2xl" /> : <FaMicrophone className="text-2xl" />}
          </button>

          <button
            onClick={toggleVideo}
            className="bg-gray-600 hover:bg-gray-700 text-white py-3 px-6 rounded-full transition-transform duration-300 ease-in-out transform hover:scale-110 flex items-center justify-center"
            aria-label={isVideoOff ? "Turn On Video" : "Turn Off Video"}
          >
            {isVideoOff ? <FaVideoSlash className="text-2xl" /> : <FaVideo className="text-2xl" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallingDialog;
