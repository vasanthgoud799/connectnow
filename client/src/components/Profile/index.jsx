import { useAppStore } from "@/store";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IoArrowBack } from "react-icons/io5";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UPDATE_PROFILE_ROUTE } from "@/utils/constants";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

function Profile() {
    const { userInfo, setUserInfo } = useAppStore();
    const navigate = useNavigate();
    const [firstName, setFirstName] = useState(userInfo?.firstName || "");
    const [lastName, setLastName] = useState(userInfo?.lastName || "");
    const [about, setAbout] = useState(userInfo?.about || "");
    const [image, setImage] = useState(userInfo?.image || "");

    // Validate Profile Information
    const validateProfile = () => {
        if (!firstName) {
            toast.error("First Name is required.");
            return false;
        }
        if (!lastName) {
            toast.error("Last Name is required.");
            return false;
        }
        return true;
    };

    // Handle Image Change
    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    // Save Profile Changes
    const saveChanges = async () => {
        if (validateProfile()) {
            try {
                const response = await apiClient.post(
                    UPDATE_PROFILE_ROUTE,
                    { firstName, lastName, image,about},
                    { withCredentials: true }
                );

                if (response.status === 200 && response.data) {
                    // Update user information in the store
                    setUserInfo({ ...response.data });
                    toast.success("Profile updated successfully");
                    navigate("/home");
                    window.location.reload();
                }
            } catch (error) {
                console.error("Error updating profile:", error.response?.data?.message || error.message);
                toast.error("Failed to update profile");
            }
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-400 p-6">
            <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
                <div>
                    <IoArrowBack
                        className="text-3xl lg:text-4xl text-black/70 cursor-pointer"
                        onClick={() => navigate("/home")}
                    />
                </div>
                <h1 className="text-2xl font-bold mb-6 text-center">Edit Profile</h1>
                <div className="mb-4">
                    <Input
                        placeholder="First Name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="rounded-full p-3"
                    />
                </div>
                <div className="mb-4">
                    <Input
                        placeholder="Last Name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="rounded-full p-3"
                    />
                </div>
                <div className="mb-4">
                    <Input
                        placeholder="About.."
                        value={about}
                        onChange={(e) => setAbout(e.target.value)}
                        className="rounded-full p-3"
                    />
                </div>
                <div className="mb-4">
                    <Input
                        placeholder="Email"
                        value={userInfo?.email || ""}
                        disabled
                        className="rounded-full p-3 bg-gray-200 cursor-not-allowed"
                    />
                </div>
                <div className="mb-4">
                    <label className="block mb-2 font-medium">Profile Image</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                    />
                    {image && (
                        <div className="mt-4">
                            <img src={image} alt="Profile" className="w-32 h-32 rounded-full object-cover mx-auto" />
                        </div>
                    )}
                </div>
                <Button onClick={saveChanges} className="w-full rounded-full p-3 bg-purple-500 text-white">
                    Save Changes
                </Button>
            </div>
        </div>
    );
}

export default Profile;
