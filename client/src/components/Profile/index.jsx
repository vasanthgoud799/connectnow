import { useAppStore } from "@/store";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { IoArrowBack } from "react-icons/io5";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CLERK_SYNC_ROUTE,
  UPDATE_PROFILE_ROUTE,
  UPLOAD_FILE_ROUTE,
} from "@/utils/constants";
import { apiClient, persistAppSession } from "@/lib/api-client";
import { toast } from "sonner";
import ThemeToggle from "@/components/ThemeToggle";
import { Camera, Copy, ShieldCheck, UserRound } from "lucide-react";
import { ensureUserE2EEIdentity, getLocalIdentitySummary } from "@/crypto/e2eeService";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";
import { useAppShellLock } from "@/hooks/useAppShellLock";

const resolveUserImage = (user) =>
  user?.image || user?.avatarUrl || user?.avatar || user?.profileImage || "";

const normalizeUserProfilePayload = (user) => {
  if (!user) return user;
  const resolvedImage = resolveUserImage(user);
  return {
    ...user,
    image: resolvedImage,
    avatar: user.avatar || resolvedImage,
    avatarUrl: user.avatarUrl || resolvedImage,
    profileImage: user.profileImage || resolvedImage,
  };
};

const PROFILE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const SUPPORTED_PROFILE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

async function compressProfileImageIfNeeded(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return file;
  }

  if (file.size <= 1024 * 1024) {
    return file;
  }

  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = previewUrl;
    });

    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.84)
    );

    if (!blob || blob.size >= file.size) {
      return file;
    }

    const nextName = file.name.replace(/\.[^.]+$/, "") || "profile";
    return new File([blob], `${nextName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

function Profile() {
  useVisualViewportHeight();
  useAppShellLock();
  const { userInfo, setUserInfo } = useAppStore();
  const { getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(userInfo?.firstName || "");
  const [lastName, setLastName] = useState(userInfo?.lastName || "");
  const [about, setAbout] = useState(userInfo?.about || "");
  const [image, setImage] = useState(resolveUserImage(userInfo));
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
  const [identitySummary, setIdentitySummary] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const imagePreviewUrlRef = useRef("");
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const normalizedAbout = about.trim();
  const resolvedExistingFirstName = String(
    userInfo?.firstName || clerkUser?.firstName || ""
  ).trim();
  const resolvedExistingLastName = String(
    userInfo?.lastName || clerkUser?.lastName || ""
  ).trim();
  const resolvedFirstName = normalizedFirstName || resolvedExistingFirstName;
  const resolvedLastName = normalizedLastName || resolvedExistingLastName;

  useEffect(() => {
    setFirstName(userInfo?.firstName || clerkUser?.firstName || "");
    setLastName(userInfo?.lastName || clerkUser?.lastName || "");
    setAbout(userInfo?.about || "");
    setImage(resolveUserImage(userInfo));
    setBirthday(
      userInfo?.birthday ? new Date(userInfo.birthday).toISOString().slice(0, 10) : ""
    );
    setImageFile(null);
  }, [clerkUser?.firstName, clerkUser?.lastName, userInfo]);

  useEffect(
    () => () => {
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    let ignore = false;

    const loadIdentitySummary = async () => {
      if (!userInfo?.id) {
        if (!ignore) {
          setIdentitySummary(null);
        }
        return;
      }

      try {
        await ensureUserE2EEIdentity(userInfo);
        const summary = await getLocalIdentitySummary(userInfo.id);
        if (!ignore) {
          setIdentitySummary(summary);
        }
      } catch (error) {
        if (!ignore) {
          setIdentitySummary(null);
        }
        console.error("Error loading local security fingerprint:", error);
      }
    };

    loadIdentitySummary();
    return () => {
      ignore = true;
    };
  }, [userInfo]);

  const validateProfile = () => {
    if (!userInfo?.id) {
      toast.error("Profile is still loading. Please try again in a moment.");
      return false;
    }

    if (!resolvedFirstName) {
      toast.error("First Name is required.");
      return false;
    }
    if (!resolvedLastName) {
      toast.error("Last Name is required.");
      return false;
    }
    return true;
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const fileType = String(file.type || "").toLowerCase();
      if (fileType && !SUPPORTED_PROFILE_IMAGE_TYPES.has(fileType)) {
        toast.error("Choose a JPEG, PNG, WebP, GIF, HEIC, or HEIF image.");
        e.target.value = "";
        return;
      }

      if (file.size > PROFILE_IMAGE_MAX_BYTES) {
        toast.error("Profile photos must be 12MB or smaller.");
        e.target.value = "";
        return;
      }

      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
      }
      const objectUrl = URL.createObjectURL(file);
      imagePreviewUrlRef.current = objectUrl;
      setImage(objectUrl);
      setImageFile(file);
    }
  };

  const uploadProfileImage = async (file) => {
    const preparedFile = await compressProfileImageIfNeeded(file);
    const formData = new FormData();
    formData.append("file", preparedFile);
    formData.append("stableMedia", "true");

    const response = await apiClient.post(UPLOAD_FILE_ROUTE, formData, {
      withCredentials: true,
    });

    return response.data;
  };

  const syncAppSessionForProfile = async () => {
    const clerkToken = await getToken();
    if (!clerkToken) {
      throw new Error("Your sign-in session expired. Please sign in again.");
    }

    const syncResponse = await apiClient.post(
      CLERK_SYNC_ROUTE,
      {
        website: "",
        company: "",
      },
      {
        withCredentials: true,
        headers: {
          Authorization: `Bearer ${clerkToken}`,
          "X-Device-Label":
            [navigator.platform, navigator.userAgentData?.platform].filter(Boolean)[0] ||
            navigator.userAgent ||
            "Browser device",
          "X-Client-Render-Time": "0",
        },
      }
    );

    const sessionToken = syncResponse.data?.session?.token || "";
    if (!sessionToken) {
      throw new Error("Could not refresh your app session. Please sign in again.");
    }

    persistAppSession({
      token: sessionToken,
      csrfToken: syncResponse.data?.session?.csrfToken || "",
    });

    if (syncResponse.data?.user) {
      setUserInfo(syncResponse.data.user);
    }
  };

  const saveChanges = async () => {
    if (validateProfile()) {
      try {
        setIsSaving(true);
        let imageUpload = null;
        if (imageFile) {
          try {
            imageUpload = await uploadProfileImage(imageFile);
          } catch (error) {
            if (error?.response?.status === 401) {
              await syncAppSessionForProfile();
              imageUpload = await uploadProfileImage(imageFile);
            } else {
              throw error;
            }
          }
        }
        const persistedImage = imageFile
          ? ""
          : /^(data|blob):/i.test(String(image || ""))
            ? ""
            : image || resolveUserImage(userInfo);
        let response;
        try {
          response = await apiClient.post(
            UPDATE_PROFILE_ROUTE,
            {
              firstName: resolvedFirstName,
              lastName: resolvedLastName,
              image: persistedImage,
              imageUpload,
              about: normalizedAbout,
              birthday,
            },
            { withCredentials: true }
          );
        } catch (error) {
          if (error?.response?.status === 401) {
            await syncAppSessionForProfile();
            response = await apiClient.post(
              UPDATE_PROFILE_ROUTE,
              {
                firstName: resolvedFirstName,
                lastName: resolvedLastName,
                image: persistedImage,
                imageUpload,
                about: normalizedAbout,
                birthday,
              },
              { withCredentials: true }
            );
          } else {
            throw error;
          }
        }

        if (response.status === 200 && response.data) {
          const updatedUser = normalizeUserProfilePayload(response.data);
          setUserInfo(updatedUser);
          setImage(resolveUserImage(updatedUser));
          setImageFile(null);
          if (imagePreviewUrlRef.current) {
            URL.revokeObjectURL(imagePreviewUrlRef.current);
            imagePreviewUrlRef.current = "";
          }
          toast.success("Profile updated successfully");
          navigate("/home");
        }
      } catch (error) {
        console.error(
          "Error updating profile:",
          error.response?.data?.message || error.message
        );
        toast.error(
          error.response?.data?.message ||
            (imageFile
              ? "Profile photo upload failed. Try a smaller image and save again."
              : "Failed to update profile")
        );
      } finally {
        setIsSaving(false);
      }
    }
  };

  const copyFingerprint = async () => {
    if (!identitySummary?.fingerprint) return;

    try {
      await navigator.clipboard.writeText(identitySummary.fingerprint);
      toast.success("Security fingerprint copied.");
    } catch {
      toast.error("Unable to copy fingerprint.");
    }
  };

  return (
    <div
      className="themed-shell flex h-[var(--app-viewport-height,100dvh)] max-h-[var(--app-viewport-height,100dvh)] min-h-0 items-start justify-center overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] md:items-center md:py-8"
      data-app-shell-lock-root
    >
      <div className="themed-panel min-w-0 w-full max-w-6xl overflow-hidden rounded-[36px] shadow-[0_30px_90px_rgba(2,8,23,0.18)] backdrop-blur-xl">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] ">
          <div className="min-w-0 border-b border-white/10 p-6 lg:border-b-0 lg:border-r lg:p-10 ">
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

          <div className="min-w-0 p-6 lg:p-10">
            <div className="mx-auto min-w-0 max-w-xl">
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
                  className="themed-input h-14 min-w-0 max-w-full rounded-2xl px-5 text-ellipsis [color-scheme:dark]"
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

              <div className="themed-page-card mt-8 min-w-0 overflow-hidden rounded-[28px] p-5" data-testid="profile-security-fingerprint-card">
                <p className="themed-title text-sm font-medium">Privacy labels</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="themed-panel-soft themed-subtitle min-w-0 rounded-2xl px-4 py-3 text-sm">
                    End-to-end identity flow
                  </div>
                  <div className="themed-panel-soft themed-subtitle min-w-0 rounded-2xl px-4 py-3 text-sm">
                    Device-aware account session
                  </div>
                </div>
              </div>

              <div className="themed-page-card mt-8 min-w-0 overflow-hidden rounded-[28px] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="themed-title text-sm font-medium">Security fingerprint</p>
                    <p className="themed-subtitle mt-1 text-xs">
                      Compare this fingerprint with your trusted devices before verifying a contact.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={copyFingerprint}
                    disabled={!identitySummary?.fingerprint}
                    data-testid="profile-copy-fingerprint-button"
                    className="themed-panel-soft inline-flex h-10 w-10 items-center justify-center rounded-2xl disabled:opacity-50"
                    title="Copy fingerprint"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <div className="themed-panel-soft mt-4 rounded-2xl px-4 py-4" data-testid="profile-fingerprint-value">
                  <p className="break-words font-mono text-sm leading-7 text-slate-100">
                    {identitySummary?.fingerprintDisplay || "Generating your device fingerprint..."}
                  </p>
                  <p className="themed-subtitle mt-3 text-xs">
                    RSA key v{identitySummary?.keyVersion || 1}
                  </p>
                </div>
              </div>

              <div className="themed-page-card mt-8 min-w-0 overflow-hidden rounded-[28px] p-5">
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
                disabled={isSaving}
                className="mt-8 h-14 w-full rounded-2xl bg-gradient-to-r from-[#f97316] via-[#fb7185] to-[#38bdf8] text-base font-semibold text-white shadow-[0_20px_60px_rgba(249,115,22,0.24)]"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;
