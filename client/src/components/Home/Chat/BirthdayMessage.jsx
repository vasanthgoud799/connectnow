import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/context/SocketContext";
import { toast } from "sonner";

function BirthdayMessage({ friend, onClose }) {
  const socket = useSocket();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleScheduleMessage = () => {
    if (!selectedDate || !selectedTime || !message) {
      setError("Please select a date, time, and enter a message.");
      return;
    }

    setLoading(true);
    setError("");

    const scheduleData = {
      friendId: friend._id,
      friendName: friend.firstName,
      date: selectedDate,
      time: selectedTime,
      message: message,
    };

    socket.emit("schedule-birthday-message", scheduleData, (response) => {
      setLoading(false);

      if (response.error) {
        setError(response.error);
      } else {
        toast.success("Birthday message scheduled successfully!");
        setSelectedDate("");
        setSelectedTime("");
        setMessage("");
        onClose();
      }
    });
  };

  return (
    <div className="fixed top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-gray-800 p-6 rounded-lg h-[450px] w-[350px] shadow-lg relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-red-300"
          aria-label="Close"
        >
          &times;
        </button>
        <h2 className="text-white text-lg font-semibold mb-4">
          Schedule Birthday Message
        </h2>
        <div className="flex flex-col space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">
              Select Date:
            </label>
            <div className="flex items-center space-x-2">
              <span className="text-white text-xl">📅</span>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-700 text-white rounded p-2 focus:ring focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-white font-medium mb-2">
              Select Time:
            </label>
            <div className="flex items-center space-x-2">
              <span className="text-white text-xl">⏰</span>
              <Input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="bg-slate-700 text-white rounded p-2 focus:ring focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-white font-medium mb-2">
              Enter Message:
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-slate-700 text-white rounded p-2 focus:ring focus:ring-blue-500"
              rows="3"
              placeholder="Write a heartfelt message..."
            />
          </div>
          {error && <div className="text-red-400 text-sm">{error}</div>}
        </div>
        <div className="flex justify-end mt-4 space-x-2">
          <Button
            onClick={() => {
              setSelectedDate("");
              setSelectedTime("");
              setMessage("");
            }}
            className="bg-red-400 text-white py-2 px-4 rounded hover:bg-red-600"
          >
            Cancel
          </Button>
          <Button
            onClick={handleScheduleMessage}
            disabled={loading}
            className="bg-green-400 text-white py-2 px-4 rounded hover:bg-green-600"
          >
            {loading ? "Scheduling..." : "Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default BirthdayMessage;
