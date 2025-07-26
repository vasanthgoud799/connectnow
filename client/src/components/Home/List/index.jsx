import React from "react";
import UserInfo from "./UserInfo";
import ChatList from "./ChatList";

function List(){
    return(
        <div className="flex flex-1 flex-col flex-grow flex-shrink basis-1/4 h-[100vh]  bg-gray-600">
            <UserInfo/>
            <ChatList/>
        </div>
    )
}
export default List;