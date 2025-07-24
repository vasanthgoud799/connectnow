import React, { useState ,useEffect} from "react";
import { Separator } from "@/components/ui/separator";

function Search({ onClose}) {
  const [searchText, setSearchText] = useState("");
  const [clear, setClear] = useState(false);
  const handleInput = (e) => {
    const inputValue = e.target.value;
    setSearchText(inputValue);
    setClear(inputValue.trim() !== "");
  };

  const handleClear = () => {
    setSearchText("");
    setClear(false);
  };



  return (
    <div className="contain flex flex-col bg-gray-400 h-screen">
      {/* Header */}
        <div className="contactInfo flex items-center h-[66px]  px-4 p-9  ">
          <div className="close mr-2">
            <img
              src="./clear.png"
              alt="Close"
              className="w-[20px] h-[20px] object-contain cursor-pointer"
              onClick={onClose}
            />
          </div>
          <span className="text-gray-800 flex-1 text-xl font-semibold ml-2">
            Search Messages
          </span>
        </div>
      <Separator className="bg-slate-900" />

      
      
       
        <div className="flex items-center m-3 rounded-xl   pl-5 pr-5 bg-gray-600 h-[40px]  shadow-sm">
          <img src="/search.png" alt="search icon" className="w-5 h-5 " />
            <input
              type="text"
              placeholder="Search messages"
              className="flex-1 bg-transparent rounded-lg px-3 py-2 text-white outline-none "
              value={searchText}
              onChange={handleInput}
            />
            {clear && (
              <img
                src="/clear.png"
                alt="clear icon"
                className="w-4 h-4 object-contain mr-3 cursor-pointer"
                onClick={handleClear}
              />
            )}
          
        </div>
        

  {/* Search Results */}
        <div className="flex flex-col divide-y divide-gray-200 bg-gray-400 overflow-y-auto scrollbar-hide">
          {[...Array(9)].map((_, index) => (
            <div key={index} className="flex items-center p-3 hover:bg-gray-500 cursor-pointer">
              
              <div>
                <p className="font-medium text-gray-800">User Name</p>
                <p className="text-sm text-gray-600">Last message snippet...</p>
              </div>
            </div>
          ))}
        </div>
      </div>

   
  );
}

export default Search;
