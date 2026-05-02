import { useAppStore } from "@/store";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { IoArrowBack } from "react-icons/io5";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UPDATE_PROFILE_ROUTE, UPLOAD_FILE_ROUTE } from "@/utils/constants";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import ThemeToggle from "@/components/ThemeToggle";
import { Camera, ShieldCheck, UserRound } from "lucide-react";

function Profile() {
  const { userInfo, setUserInfo } = useAppStore();
  const { user: clerkUser } = useUser();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(userInfo?.firstName || "");
  const [lastName, setLastName] = useState(userInfo?.lastName || "");
  const [about, setAbout] = useState(userInfo?.about || "");
  const [image, setImage] = useState(userInfo?.image || "");
  const [imageFile, setImageFile] = useState(null);
  const [birthday, setBirthday] = useState(
    userInfo?.birthday ? new Date(userInfo.birthday).toISOString().slice(0, 10) : ""
  );
  const externalProviders =
    clerkUser?.externalAccounts?.map((account) => account.provider).filter(Boolean) || [];
  const hasGoogleSignIn = externalProviders.some((provider) =>
    String(provider).toLowerCase().includes("google")
  );
  const passwordEnabled = Boolean(clerkUser?.passwordEnabled);

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

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result);
        setImageFile(file);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadProfileImage = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("stableMedia", "true");

    const response = await apiClient.post(UPLOAD_FILE_ROUTE, formData, {
      withCredentials: true,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data;
  };

  const saveChanges = async () => {
    if (validateProfile()) {
      try {
        const imageUpload = imageFile ? await uploadProfileImage(imageFile) : null;
        const response = await apiClient.post(
          UPDATE_PROFILE_ROUTE,
          { firstName, lastName, image, imageUpload, about, birthday },
          { withCredentials: true }
        );

        if (response.status === 200 && response.data) {
          setUserInfo({ ...response.data });
          toast.success("Profile updated successfully");
          navigate("/home");
          window.location.reload();
        }
      } catch (error) {
        console.error(
          "Error updating profile:",
          error.response?.data?.message || error.message
        );
        toast.error("Failed to update profile");
      }
    }
  };

  return (
    <div className="themed-shell flex min-h-screen items-center justify-center px-4 py-8 ">
      <div className="themed-panel w-full max-w-6xl   rounded-[36px]  shadow-[0_30px_90px_rgba(2,8,23,0.18)] backdrop-blur-xl">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] ">
          <div className="border-b border-white/10 p-8 lg:border-b-0 lg:border-r lg:p-10 ">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate("/home")}
                className="themed-panel-soft inline-flex h-11 w-11 items-center justify-center rounded-2xl"
              >
                <IoArrowBack className="themed-title text-xl" />
              </button>
              <ThemeToggle />
            </div>

            <p className="themed-accent-text mt-10 text-xs uppercase tracking-[0.28em]">
              Profile studio
            </p>
            <h1 className="themed-title mt-4 font-['Space_Grotesk'] text-4xl font-bold tracking-[-0.04em]">
              Shape how people see you.
            </h1>
            <p className="themed-subtitle mt-4 max-w-md">
              Update your identity, status, and profile photo with a polished
              settings experience that feels like a real product.
            </p>

            <div className="themed-page-card mt-10 rounded-[28px] p-6">
              <div className="themed-panel-soft relative mx-auto flex h-40 w-40 items-center justify-center rounded-[32px]">
                <img
                  src={image || "/avatar.png"}
                  alt="Profile"
                  className="h-36 w-36 rounded-[28px] object-cover"
                />
                <label className="absolute bottom-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-[#f97316] to-[#38bdf8] shadow-[0_12px_30px_rgba(56,189,248,0.25)]">
                  <Camera className="h-4 w-4 text-white" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="mt-8 space-y-4">
                <div className="themed-panel-soft flex items-center gap-3 rounded-2xl px-4 py-3">
                  <div className="themed-icon-chip">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="themed-title text-sm font-medium">Identity</p>
                    <p className="themed-subtitle text-xs">
                      First impression matters in chat products.
                    </p>
                  </div>
                </div>
                <div className="themed-panel-soft flex items-center gap-3 rounded-2xl px-4 py-3">
                  <div className="themed-icon-chip">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="themed-title text-sm font-medium">Private by default</p>
                    <p className="themed-subtitle text-xs">
                      Your details stay inside your authenticated account.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 lg:p-10">
            <div className="mx-auto max-w-xl">
              <h2 className="themed-title font-['Space_Grotesk'] text-3xl font-semibold">
                Edit profile
              </h2>
              <p className="themed-subtitle mt-2">
                A cleaner settings page with better spacing, hierarchy, and trust.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <Input
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="themed-input h-14 rounded-2xl px-5"
                />
                <Input
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="themed-input h-14 rounded-2xl px-5"
                />
              </div>

              <div className="mt-4">
                <Input
                  placeholder="About"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  className="themed-input h-14 rounded-2xl px-5"
                />
              </div>

              <div className="mt-4">
                <Input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className="themed-input h-14 rounded-2xl px-5"
                />
              </div>

              <div className="mt-4">
                <Input
                  placeholder="Email"
                  value={userInfo?.email || ""}
                  disabled
                  className="themed-input themed-subtitle h-14 rounded-2xl px-5"
                />
              </div>

              <div className="themed-page-card mt-8 rounded-[28px] p-5">
                <p className="themed-title text-sm font-medium">Privacy labels</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="themed-panel-soft themed-subtitle rounded-2xl px-4 py-3 text-sm">
                    End-to-end identity flow
                  </div>
                  <div className="themed-panel-soft themed-subtitle rounded-2xl px-4 py-3 text-sm">
                    Device-aware account session
                  </div>
                </div>
              </div>

              <div className="themed-page-card mt-8 rounded-[28px] p-5">
                <div className="flex items-center gap-3">
                  <div className="themed-icon-chip">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="themed-title text-sm font-medium">Account access</p>
                    <p className="themed-subtitle text-xs">
                      See how you sign in and manage your password when available.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {hasGoogleSignIn && (
                    <div className="themed-panel-soft themed-title rounded-full px-4 py-2 text-sm">
                      Google sign-in
                    </div>
                  )}
                  {passwordEnabled && (
                    <div className="themed-panel-soft themed-title rounded-full px-4 py-2 text-sm">
                      Email and password
                    </div>
                  )}
                  {!hasGoogleSignIn && !passwordEnabled && (
                    <div className="themed-panel-soft themed-subtitle rounded-full px-4 py-2 text-sm">
                      Clerk-managed account
                    </div>
                  )}
                </div>

                <div className="themed-panel-soft mt-5 rounded-2xl px-4 py-4">
                  <p className="themed-title text-sm font-medium">Sign-in method</p>
                  <p className="themed-subtitle mt-2 text-xs leading-6">
                    This account is currently managed by your active sign-in provider.
                    Password setup and high-security verification are intentionally
                    kept out of this profile screen so the experience stays inside
                    ConnectNow without sending users into an external security flow.
                  </p>
                  {!passwordEnabled && hasGoogleSignIn && (
                    <p className="themed-subtitle mt-3 text-xs leading-6">
                      You are using Google sign-in only right now.
                    </p>
                  )}
                </div>
              </div>

              <Button
                onClick={saveChanges}
                className="mt-8 h-14 w-full rounded-2xl bg-gradient-to-r from-[#f97316] via-[#fb7185] to-[#38bdf8] text-base font-semibold text-white shadow-[0_20px_60px_rgba(249,115,22,0.24)]"
              >
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;
