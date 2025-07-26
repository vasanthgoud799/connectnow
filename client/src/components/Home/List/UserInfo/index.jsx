import React from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LOGOUT_ROUTE } from "@/utils/constants";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

function UserInfo() {
    const { userInfo, setUserInfo } = useAppStore();
    const navigate = useNavigate(); // Hook for navigation

    const handleLogout = async() => {
                try {
                    const response = await apiClient.post(
                        LOGOUT_ROUTE,
                        {},
                        { withCredentials: true }
                    );
    
                    if (response.status === 200) {
                        // Update user information in the store
                        navigate("/auth");
                        toast.success("Logged Out Successfully");
                        setUserInfo(null);
                    }
                } catch (error) {
                    console.error("Error logging out:", error.response?.data?.message || error.message);
                    toast.error("Failed to logout");
                }
            };
    const editProfile = async() => {
                try {
                    
                        // Update user information in the store
                        navigate("/profile");
                        toast.success("Edit your Profile");
                    
                       
                    }
                 catch (error) {
                    console.error("Error logging out:", error.response?.data?.message || error.message);
                    toast.error("Failed to logout");
                }
            };

    return (
        <div className="flex items-center p-2 justify-between">
            <div className="flex items-center gap-3">
                <img src={userInfo.image || "/avatar.png"} alt="avatar" className="w-[50px] h-[50px] rounded-full object-cover" />
                <p className="font-bold font-sans text-2xl text-gray-200">{userInfo.firstName || "Guest"}</p>
            </div>
            <div className="flex gap-3">
                <img src="/edit.png" className="w-[22px] object-contain" alt="Edit" onClick={editProfile}/>
                <Button className="bg-slate-700" onClick={handleLogout}>
                    <div className="flex items-center gap-1">
                        <img src="/logout.png" className="w-[22px] object-contain" alt="Logout" />
                        <span className="text-white text-lg font-bold">Log out</span>
                    </div>
                </Button>
            </div>
        </div>
    );
}

export default UserInfo;
