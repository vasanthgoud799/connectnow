function ChatView({ header, messageArea, composer }) {
  return (
    <div className="chat-shell">
      {header}
      {messageArea}
      {composer}
    </div>
  );
}

export default ChatView;
