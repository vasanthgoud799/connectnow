import ChatList from "./ChatList";

function List({ onOpenChat }) {
  return (
    <div className="flex h-full w-full shrink-0 flex-col md:w-[26rem]">
      <ChatList onOpenChat={onOpenChat} />
    </div>
  );
}
export default List;
