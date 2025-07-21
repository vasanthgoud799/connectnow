// src/components/Home/Chat/AttachmentMenu.jsx
import React from 'react';

const AttachmentMenu = ({ onAttach }) => {
  const menuItems = [
    {
      label: 'Photos',
      imageSrc: './stickers.png',
      type: 'image',
    },
    {
      label: 'Videos',
      imageSrc: './Cam.png',
      type: 'video',
    },
    {
      label: 'Audio',
      imageSrc: './mic.png',
      type: 'audio',
    },
    {
      label: 'Document',
      imageSrc: './document.png',
      type: 'document',
    },
  ];

  const handleFileInput = (type) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'document' ? 'application/*' : `${type}/*`;
    input.onchange = (event) => {
      const file = event.target.files[0];
      if (file) {
        onAttach(file, type); // Pass both file and type
      }
    };
    input.click();
  };

  return (
    <div className="absolute bottom-11 right-4 bg-gray-800 rounded-lg shadow-xl p-2 flex flex-col w-[150px] gap-1">
      {menuItems.map((item, index) => (
        <div
          key={index}
          className="flex items-center gap-1 p-2 hover:bg-gray-700 rounded-md transition-all duration-200 ease-in-out cursor-pointer"
          onClick={() => handleFileInput(item.type)}
        >
          <img
            src={item.imageSrc}
            alt={item.label}
            className="w-8 h-8 object-contain"
          />
          <span className="text-sm font-semibold text-slate-200">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default AttachmentMenu;
