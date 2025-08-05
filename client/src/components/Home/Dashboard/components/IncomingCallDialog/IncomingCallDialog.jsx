import React, { useEffect, useState } from 'react';
import { acceptIncomingCallRequest, rejectIncomingCallRequest } from '@utils/webRTC/webRTCHandler';

import './IncomingCallDialog.css';
import { FaPhoneAlt } from 'react-icons/fa';
import { RiCloseCircleFill } from 'react-icons/ri';
 
const IncomingCallDialog = ({ callerUsername,callerImage }) => {
  const [countdown, setCountdown] = useState(30);
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === 1) {
          clearInterval(timer);
          handleRejectButtonPressed();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);
  const handleAcceptButtonPressed = () => {
    acceptIncomingCallRequest();
  };

  const handleRejectButtonPressed = () => {
    rejectIncomingCallRequest();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-transparent z-10 bg-opacity-70">
       <div className="bg-gray-600 rounded-lg shadow-2xl w-[500px] sm:w-[600px] p-6 flex flex-col items-center animate-fadeIn">
        <h2 className="text-white text-3xl font-semibold mb-4 text-center">Incoming Call</h2>
        <div className="flex flex-col items-center mb-4">
        <img 
            src={callerImage} 
            alt={callerUsername} 
            className="rounded-full mb-4 w-32 h-32 border-4 border-white object-cover"
          />
          <p className="text-white text-xl mb-2">{callerUsername} is calling you...</p>
          <p className="text-gray-400 text-sm mb-4">Time remaining: <span className="font-semibold">{countdown}s</span></p>
        </div>
        <div className="flex justify-around mt-4 w-full">
          <button
            onClick={handleAcceptButtonPressed}
            className="flex items-center bg-green-500 text-white px-4 py-3 rounded-full hover:bg-green-400 transition transform hover:scale-105"
            // aria-label={`Accept call from ${caller.firstName}`}
          >
            <FaPhoneAlt className="mr-2 text-xl" />
          </button>
          <button
            onClick={handleRejectButtonPressed}
            className="flex items-center bg-red-500 text-white px-6 py-3 rounded-full hover:bg-red-400 transition transform hover:scale-105"
            // aria-label={`Reject call from ${caller.firstName}`}
          >
            <RiCloseCircleFill className="mr-2 text-2xl" />
          </button>
        </div>
      </div>
    </div>
    
  );
};

export default IncomingCallDialog;
