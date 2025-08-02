import React, { useState, useEffect } from 'react';
import { sendMessageUsingDataChannel } from '@utils/webRTC/webRTCHandler';
import dayjs from 'dayjs';
import MessagesList from './MessageDisplayer';

const Messenger = ({ message, setDirectCallMessage }) => {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([]); // To store all messages

  // Handle sending a message
  const handleSendMessage = () => {
    if (inputValue.trim()) {
      console.log('Sending message:', inputValue); // Log the sent message

      // Send the message
      sendMessageUsingDataChannel(inputValue);

      // Add the sent message to the messages list
      setMessages((prev) => {
        const updatedMessages = [
          ...prev,
          {
            id: dayjs().format('YYYY-MM-DDTHH:mm:ss.SSSZ'), // Unique identifier
            content: inputValue,
            type: 'sent',
            timestamp: dayjs().format('h:mm A'),
          },
        ];
        console.log('Updated messages after sending:', updatedMessages); // Log the updated messages
        return updatedMessages;
      });

      setInputValue('');
    }
  };

  // Handle Enter key press
  const handleOnKeyDownEvent = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // Effect to handle incoming messages
  useEffect(() => {
    if (message.received) {
      console.log('Received message:', message.content); // Log the received message

      setMessages((prev) => {
        const updatedMessages = [
          ...prev,
          {
            id: dayjs().format('YYYY-MM-DDTHH:mm:ss.SSSZ'), // Unique identifier
            content: message.content,
            type: 'received',
            timestamp: dayjs().format('h:mm A'),
          },
        ];
        console.log('Messages after receiving:', updatedMessages); // Log the messages after receiving
        return updatedMessages;
      });

      setTimeout(() => {
        setDirectCallMessage(false, '');
      }, 10000);
    }
  }, [message, setDirectCallMessage]); // Ensure correct dependencies

  return (
    <div className="flex flex-col h-full w-full bg-gradient-to-b from-gray-900 to-gray-800 text-black rounded-lg shadow-md">
      {/* Messages List */}
      <MessagesList messages={messages} />

      {/* Input Field */}
      <div className="p-2 bg-gray-700  flex items-center w-full">
        <input
          className="flex-grow p-3 rounded-md  bg-gray-600 border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleOnKeyDownEvent}
          placeholder="Type your message..."
        />
        <button
          onClick={handleSendMessage}
          className="ml-3 px-4 py-2 bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600 focus:outline-none"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Messenger;
