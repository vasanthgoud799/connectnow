import { useEffect, useRef } from "react";

const MessagesList = ({ messages }) => {
  const messagesEndRef = useRef(null);

  
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

 
  useEffect(() => {
    scrollToBottom();
  }, [messages]); 
  return (
    <div className="flex-grow overflow-y-auto scrollbar-hide p-4 w-full max-h-[calc(100vh-70px)]">
      {messages.map((msg) => (
        <div
          key={msg.id} 
          className={`flex items-end ${msg.type === 'sent' ? 'justify-end' : 'justify-start'} mb-3`}
        >
          <div
            className={`max-w-[90%] p-2 rounded-lg text-sm shadow-md ${msg.type === 'sent' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-300 text-black rounded-bl-none'}`}
          >
            <p>{msg.content}</p>
            <span className="text-xs text-gray-200 mt-1 block text-right">
              {msg.timestamp}
            </span>
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessagesList;
