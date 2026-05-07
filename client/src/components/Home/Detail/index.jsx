import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store";
import { apiClient } from "@/lib/api-client.js";
import {
  BLOCK_USER_ROUTE,
  CALLS_LOG_ROUTE,
  DELETE_CHAT_ROUTE,
  GROUPS_ROUTE,
  LIST_CONTACTS_ROUTE,
  UNBLOCK_USER_ROUTE,
  UNFRIEND_ROUTE,
  UPLOAD_FILE_ROUTE,
} from "@/utils/constants.js";
import { toast } from "sonner";
import {
  Ban,
  Download,
  ExternalLink,
  FileText,
  ImagePlus,
  Link2,
  Phone,
  Play,
  Plus,
  Save,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { callToOtherUser } from "@/utils/webRTC/webRTCHandler";
import { isDirectCallBusy } from "@/store/actions/callActions";
import { connect } from "react-redux";
import {
  decryptMediaAttachmentToObjectUrl,
  formatFingerprintForDisplay,
} from "@/crypto/e2eeService";
import { useTrustStatus } from "../Chat/hooks/useTrustStatus";
import MobileSafeHeader from "@/components/ui/MobileSafeHeader";

function getAttachmentKind(message) {
  const type = String(message?.messageType || "").toLowerCase();
  if (type === "image" || type.startsWith("image/")) return "image";
  if (type === "video" || type.startsWith("video/")) return "video";
  if (type === "audio" || type.startsWith("audio/")) return "audio";
  return "document";
}

function getGroupMember(member) {
  const user = member?.user || {};
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "Member";
  return {
    _id: user?._id || user?.id || member?.user,
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    image: user?.image || "/avatar.png",
    role: member?.role || "member",
    displayName,
  };
}

function extractLinks(content = "") {
  const matches = String(content).match(/https?:\/\/[^\s]+/g);
  return matches || [];
}

function getMonthLabel(dateValue) {
  const date = new Date(dateValue || Date.now());
  const now = new Date();
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  ) {
    return "This month";
  }

  return date.toLocaleString([], {
    month: "long",
    year: "numeric",
  });
}

function groupItemsByMonth(items = [], getDateValue) {
  return items.reduce((accumulator, item) => {
    const monthLabel = getMonthLabel(getDateValue(item));
    if (!accumulator[monthLabel]) {
      accumulator[monthLabel] = [];
    }
    accumulator[monthLabel].push(item);
    return accumulator;
  }, {});
}

function getMessageFileName(message) {
  const fileFromMeta = message?.meta?.fileName;
  if (fileFromMeta) return fileFromMeta;

  try {
    const url = new URL(message?.fileUrl || "", window.location.origin);
    return decodeURIComponent(url.pathname.split("/").pop() || "Document");
  } catch {
    return decodeURIComponent(String(message?.fileUrl || "").split("/").pop() || "Document");
  }
}

function Detail({ onClose, activeUsers = [], callState }) {
  const {
    userInfo,
    selectedChatData,
    setSelectedChatData,
    setFriends,
    setSelectedChatMessages,
    selectedChatMessages,
    removeFriend,
    setUserInfo,
    chatSummaries,
    upsertChatSummary,
    removeChatSummary,
    setSelectedConversationKey,
  } = useAppStore();
  const safeSelectedChatMessages = Array.isArray(selectedChatMessages)
    ? selectedChatMessages
    : [];

  const [isBlocked, setIsBlocked] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupImageFile, setGroupImageFile] = useState(null);
  const [groupTab, setGroupTab] = useState("media");
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [resolvedAttachmentMap, setResolvedAttachmentMap] = useState({});

  const isGroupChat = Boolean(selectedChatData?.isGroup);

  useEffect(() => {
    if (!selectedChatData || isGroupChat || !userInfo?.blockedUsers) return;
    setIsBlocked(userInfo.blockedUsers.includes(selectedChatData._id));
  }, [isGroupChat, selectedChatData, userInfo?.blockedUsers]);

  useEffect(() => {
    if (!isGroupChat || !selectedChatData) return;
    setGroupName(selectedChatData?.name || "");
    setGroupDescription(selectedChatData?.description || "");
    setGroupImageFile(null);
    setSelectedMemberIds([]);
  }, [isGroupChat, selectedChatData]);

  const selectedChatSummary = useMemo(
    () =>
      chatSummaries.find(
        (chat) => chat.conversationKey === selectedChatData?.conversationKey
      ),
    [chatSummaries, selectedChatData?.conversationKey]
  );

  useEffect(() => {
    if (!isGroupChat || !selectedChatData?._id) return;
    if (Array.isArray(selectedChatData?.members) && selectedChatData.members.length) return;

    const loadGroupDetails = async () => {
      try {
        const response = await apiClient.get(`${GROUPS_ROUTE}/${selectedChatData._id}`, {
          withCredentials: true,
        });
        const group = response.data.group;
        if (!group) return;

        const nextGroupData = {
          _id: group._id,
          id: group._id,
          name: group.name,
          description: group.description,
          image: group.image,
          members: group.members,
          memberCount: group.members?.length || selectedChatData?.memberCount || 0,
          inviteToken: group.inviteToken,
          role: group.role,
          createdBy: group.createdBy,
          isGroup: true,
          conversationKey:
            selectedChatData?.conversationKey || `group:${group._id}`,
        };

        setSelectedChatData(nextGroupData);
        if (selectedChatSummary) {
          upsertChatSummary({
            ...selectedChatSummary,
            group: {
              ...selectedChatSummary.group,
              ...group,
              memberCount: group.members?.length || 0,
            },
            title: group.name,
            image: group.image,
          });
        }
      } catch (error) {
        console.error("Error loading group details:", error);
      }
    };

    loadGroupDetails();
  }, [
    isGroupChat,
    selectedChatData?._id,
    selectedChatData?.members,
    selectedChatData?.conversationKey,
    selectedChatData?.memberCount,
    selectedChatSummary,
    setSelectedChatData,
    upsertChatSummary,
  ]);

  useEffect(() => {
    if (!isGroupChat || !selectedChatData) return;

    const loadContacts = async () => {
      try {
        setLoadingContacts(true);
        const response = await apiClient.get(LIST_CONTACTS_ROUTE, {
          withCredentials: true,
        });
        setContacts(response.data.contacts || []);
      } catch (error) {
        console.error("Error loading contacts:", error);
      } finally {
        setLoadingContacts(false);
      }
    };

    loadContacts();
  }, [isGroupChat, selectedChatData]);

  const groupMembers = useMemo(
    () => (selectedChatData?.members || []).map(getGroupMember),
    [selectedChatData?.members]
  );

  const currentMemberRole = useMemo(() => {
    if (!isGroupChat) return null;
    return (
      groupMembers.find((member) => String(member._id) === String(userInfo?.id))?.role ||
      "member"
    );
  }, [groupMembers, isGroupChat, userInfo?.id]);

  const canManageGroup = ["owner", "admin"].includes(currentMemberRole);
  const canEditGroup = Boolean(isGroupChat && currentMemberRole);
  const canInvitePeople = canManageGroup;

  const currentMemberIds = useMemo(
    () => new Set(groupMembers.map((member) => String(member._id))),
    [groupMembers]
  );

  const availableContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const contactId = String(contact._id || contact.id);
      if (currentMemberIds.has(contactId)) return false;

      const haystack = `${contact.firstName || ""} ${contact.lastName || ""} ${contact.email || ""}`
        .toLowerCase()
        .trim();

      return haystack.includes(memberSearch.toLowerCase());
    });
  }, [contacts, currentMemberIds, memberSearch]);

  const sharedMediaItems = useMemo(
    () =>
      safeSelectedChatMessages.filter(
        (message) =>
          message?.fileUrl &&
          ["image", "video"].includes(getAttachmentKind(message))
      ),
    [safeSelectedChatMessages]
  );

  const sharedDocumentItems = useMemo(
    () =>
      safeSelectedChatMessages.filter(
        (message) =>
          message?.fileUrl && getAttachmentKind(message) === "document"
      ),
    [safeSelectedChatMessages]
  );

  const sharedLinkItems = useMemo(
    () =>
      safeSelectedChatMessages.flatMap((message) =>
        extractLinks(message?.content).map((url) => ({
          messageId: String(message?._id || message?.id || url),
          url,
          sender:
            [message?.sender?.firstName, message?.sender?.lastName]
              .filter(Boolean)
              .join(" ") ||
            message?.sender?.email ||
          "Member",
        }))
      ),
    [safeSelectedChatMessages]
  );

  const groupedSharedMedia = useMemo(
    () => groupItemsByMonth(sharedMediaItems, (message) => message?.timestamp || message?.createdAt),
    [sharedMediaItems]
  );

  const groupedSharedDocs = useMemo(
    () => groupItemsByMonth(sharedDocumentItems, (message) => message?.timestamp || message?.createdAt),
    [sharedDocumentItems]
  );

  const recentSharedMedia = useMemo(
    () =>
      [...sharedMediaItems]
        .sort(
          (a, b) =>
            new Date(b?.timestamp || b?.createdAt || 0).getTime() -
            new Date(a?.timestamp || a?.createdAt || 0).getTime()
        )
        .slice(0, 4),
    [sharedMediaItems]
  );

  const hiddenMediaCount = Math.max(0, sharedMediaItems.length - 3);
  const {
    contactTrustState,
    loadingContactTrustState,
    verifyCurrentFingerprint,
    clearFingerprintVerification,
  } = useTrustStatus({
    isGroupChat,
    selectedChatId: selectedChatData?._id || selectedChatData?.id,
    currentUserId: userInfo?.id,
    displayName:
      [selectedChatData?.firstName, selectedChatData?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || selectedChatData?.email,
  });

  useEffect(() => {
    let isCancelled = false;

    const resolveAttachments = async () => {
      const attachmentMessages = safeSelectedChatMessages.filter(
        // Normalize defensively in case an older state shape is still around.
        // This keeps Detail from crashing while the rest of the app repairs state.
        (message) => message?.fileUrl
      );
      const normalizedAttachmentMessages = Array.isArray(attachmentMessages)
        ? attachmentMessages
        : [];

      if (!normalizedAttachmentMessages.length) {
        setResolvedAttachmentMap({});
        return;
      }

      const entries = await Promise.all(
        normalizedAttachmentMessages.map(async (message) => {
          const messageId = String(message._id || message.id);
          try {
            if (message?.mediaEncryption?.enabled && userInfo?.id) {
              const resolved = await decryptMediaAttachmentToObjectUrl({
                message,
                currentUserId: userInfo.id,
              });
              return [
                messageId,
                {
                  objectUrl: resolved.objectUrl,
                  fileName: resolved.fileName || getMessageFileName(message),
                  mimeType: resolved.mimeType || "",
                  fileSize: resolved.fileSize || 0,
                },
              ];
            }

            return [
              messageId,
              {
                objectUrl: message.fileUrl,
                fileName: getMessageFileName(message),
                mimeType: "",
                fileSize: 0,
              },
            ];
          } catch (error) {
            console.error("Error resolving shared attachment:", error);
            return [
              messageId,
              {
                objectUrl: message.fileUrl,
                fileName: getMessageFileName(message),
                mimeType: "",
                fileSize: 0,
              },
            ];
          }
        })
      );

      if (!isCancelled) {
        setResolvedAttachmentMap(Object.fromEntries(entries));
      }
    };

    resolveAttachments();

    return () => {
      isCancelled = true;
    };
  }, [safeSelectedChatMessages, userInfo?.id]);

  const getResolvedAttachment = (message) =>
    resolvedAttachmentMap[String(message?._id || message?.id)] || null;

  const uploadGroupImage = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("stableMedia", "true");
    const response = await apiClient.post(UPLOAD_FILE_ROUTE, formData, {
      withCredentials: true,
    });
    return response.data;
  };

  const updateSelectedGroupState = (group) => {
    const nextGroupData = {
      _id: group._id,
      id: group._id,
      name: group.name,
      description: group.description,
      image: group.image,
      members: group.members,
      inviteToken: group.inviteToken,
      role: group.role,
      createdBy: group.createdBy,
      isGroup: true,
      conversationKey:
        selectedChatData?.conversationKey || `group:${group._id}`,
    };

    setSelectedChatData(nextGroupData);

    if (selectedChatSummary) {
      upsertChatSummary({
        ...selectedChatSummary,
        group,
        title: group.name,
        image: group.image,
      });
    }
  };

  const deleteChat = async () => {
    try {
      const response = await apiClient.post(
        DELETE_CHAT_ROUTE,
        { id: selectedChatData._id },
        { withCredentials: true }
      );
      if (response.data?.conversationKey) {
        removeChatSummary(response.data.conversationKey);
      }
      setSelectedChatMessages([]);
      setSelectedConversationKey(undefined);
      setSelectedChatData(undefined);
      onClose?.();
      toast.success("Chat deleted successfully");
    } catch (err) {
      console.log("Error deleting chat:", err);
      toast.error(err?.response?.data?.message || "Unable to delete chat.");
    }
  };

  const unFriend = async () => {
    try {
      await apiClient.post(
        UNFRIEND_ROUTE,
        { id: selectedChatData?._id },
        { withCredentials: true }
      );
      toast.success("Friend removed");
      removeFriend(selectedChatData._id);
      setFriends(selectedChatData._id);
      setUserInfo({
        ...userInfo,
        friends: (userInfo?.friends || []).filter(
          (friendId) => friendId !== selectedChatData._id
        ),
      });
      setSelectedChatData(undefined);
      onClose();
    } catch (err) {
      console.log("Error unfriending:", err);
    }
  };

  const handleBlockUser = async () => {
    try {
      await apiClient.post(
        BLOCK_USER_ROUTE,
        { id: selectedChatData?._id },
        { withCredentials: true }
      );
      toast.success("User blocked successfully");
      setIsBlocked(true);
      setUserInfo({
        ...userInfo,
        blockedUsers: [
          ...new Set([
            ...(userInfo?.blockedUsers || []),
            selectedChatData?._id,
          ]),
        ],
      });
    } catch (error) {
      console.error("Failed to block user:", error);
      toast.error(
        error?.response?.data?.message || "Unable to block this user."
      );
    }
  };

  const handleUnblockUser = async () => {
    try {
      await apiClient.post(
        UNBLOCK_USER_ROUTE,
        { id: selectedChatData?._id },
        { withCredentials: true }
      );
      toast.success("User unblocked successfully");
      setIsBlocked(false);
      setUserInfo({
        ...userInfo,
        blockedUsers: (userInfo?.blockedUsers || []).filter(
          (id) => id !== selectedChatData?._id
        ),
      });
    } catch (error) {
      console.error("Failed to unblock user:", error);
    }
  };

  const initiateCall = (callType = "video") => {
    const selectedChatId = selectedChatData?._id || selectedChatData?.id;
    const selectedChatEmail = selectedChatData?.email;
    const selectedChatName = [selectedChatData?.firstName, selectedChatData?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    const activeCallUser = (activeUsers || []).find((activeUserItem) => {
      const activeUserId = activeUserItem.userId;
      const activeUserEmail = activeUserItem.email;
      const activeUserName =
        activeUserItem.displayName || activeUserItem.username;

      return (
        (selectedChatId &&
          activeUserId &&
          String(activeUserId) === String(selectedChatId)) ||
        (selectedChatEmail && activeUserEmail === selectedChatEmail) ||
        (selectedChatName && activeUserName === selectedChatName) ||
        (selectedChatData?.firstName &&
          activeUserItem.username === selectedChatData.firstName)
      );
    });

    if (isDirectCallBusy(callState)) {
      toast.error("Finish the current call before starting another one.");
      return;
    }

    if (!activeCallUser || !selectedChatId) {
      toast.error("This user is not available for calling right now.");
      return;
    }

    apiClient
      .post(
        CALLS_LOG_ROUTE,
        { recipientId: selectedChatId, type: callType, status: "initiated" },
        { withCredentials: true }
      )
      .catch((error) => console.error("Error logging call:", error));

    callToOtherUser(
      {
        userId: selectedChatId,
        socketId: activeCallUser?.socketId,
        username: activeCallUser?.username,
        displayName: activeCallUser?.displayName,
        email: activeCallUser?.email,
      },
      callType
    );
  };

  const saveGroupDetails = async () => {
    if (!canEditGroup) return;

    try {
      setSavingGroup(true);
      let nextImage = selectedChatData?.image || "";
      let imageUpload = null;

      if (groupImageFile) {
        imageUpload = await uploadGroupImage(groupImageFile);
      } else {
        nextImage = selectedChatData?.image || "";
      }

      const response = await apiClient.patch(
        `${GROUPS_ROUTE}/${selectedChatData._id}`,
        {
          name: groupName.trim(),
          description: groupDescription.trim(),
          image: nextImage,
          imageUpload,
        },
        { withCredentials: true }
      );

      updateSelectedGroupState(response.data.group);
      setEditMode(false);
      setGroupImageFile(null);
      toast.success("Group updated");
    } catch (error) {
      console.error("Error updating group:", error);
      toast.error(error.response?.data?.message || "Unable to update group.");
    } finally {
      setSavingGroup(false);
    }
  };

  const addSelectedMembers = async () => {
    if (!selectedMemberIds.length) {
      toast.error("Select at least one contact.");
      return;
    }

    try {
      setAddingMembers(true);
      const response = await apiClient.post(
        `${GROUPS_ROUTE}/${selectedChatData._id}/members`,
        { members: selectedMemberIds },
        { withCredentials: true }
      );
      updateSelectedGroupState(response.data.group);
      setSelectedMemberIds([]);
      toast.success("Invites sent");
    } catch (error) {
      console.error("Error adding members:", error);
      toast.error(error.response?.data?.message || "Unable to invite members.");
    } finally {
      setAddingMembers(false);
    }
  };

  const removeGroupMember = async (memberId) => {
    try {
      const response = await apiClient.delete(
        `${GROUPS_ROUTE}/${selectedChatData._id}/members/${memberId}`,
        { withCredentials: true }
      );
      updateSelectedGroupState(response.data.group);
      toast.success("Member removed");
    } catch (error) {
      console.error("Error removing member:", error);
      toast.error(error.response?.data?.message || "Unable to remove member.");
    }
  };

  const leaveGroup = async () => {
    try {
      await apiClient.post(
        `${GROUPS_ROUTE}/${selectedChatData._id}/leave`,
        {},
        { withCredentials: true }
      );
      toast.success("You left the group");
      setSelectedChatData(undefined);
      onClose();
    } catch (error) {
      console.error("Error leaving group:", error);
      toast.error(error.response?.data?.message || "Unable to leave group.");
    }
  };

  const copyInviteLink = async () => {
    try {
      const inviteLink = `${window.location.origin}/join-group/${selectedChatData?.inviteToken}`;
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Invite link copied");
    } catch (error) {
      console.error("Error copying invite link:", error);
      toast.error("Unable to copy invite link.");
    }
  };

  if (!selectedChatData) return null;

  const groupImagePreview = groupImageFile
    ? URL.createObjectURL(groupImageFile)
    : selectedChatData.image || "/avatar.png";

  const toggleSelectedMember = (memberId) => {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    );
  };

  const renderSharedGallery = () => (
    <div className="themed-page-card rounded-[28px] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="themed-title text-xl font-semibold">Media, links and docs</p>
          <p className="themed-subtitle text-sm">
            Browse everything shared in this conversation.
          </p>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-2">
        {[
          { id: "media", label: `Media ${sharedMediaItems.length ? `(${sharedMediaItems.length})` : ""}`.trim() },
          { id: "docs", label: `Docs ${sharedDocumentItems.length ? `(${sharedDocumentItems.length})` : ""}`.trim() },
          { id: "links", label: `Links ${sharedLinkItems.length ? `(${sharedLinkItems.length})` : ""}`.trim() },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setGroupTab(tab.id)}
            className={`rounded-full px-4 py-2 text-sm transition ${
              groupTab === tab.id ? "bg-cyan-400 text-slate-950" : "themed-action-neutral"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {groupTab === "media" && (
        <div className="space-y-4">
          {recentSharedMedia.length ? (
            <>
              <div className="grid grid-cols-4 gap-3">
                {recentSharedMedia.map((message, index) => {
                  const isVideo = getAttachmentKind(message) === "video";
                  const showMoreTile = index === 3 && hiddenMediaCount > 0;

                  return (
                    <button
                      key={String(message._id || message.id)}
                      type="button"
                      onClick={() => {
                        setGroupTab("media");
                        setIsGalleryOpen(true);
                      }}
                      className="group themed-panel-soft relative aspect-square overflow-hidden rounded-[20px] text-left"
                    >
                      {isVideo ? (
                        <video
                          src={getResolvedAttachment(message)?.objectUrl || message.fileUrl}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          muted
                        />
                      ) : (
                        <img
                          src={getResolvedAttachment(message)?.objectUrl || message.fileUrl}
                          alt="Recent shared media"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />
                      {showMoreTile ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-xl font-semibold text-white">
                          +{hiddenMediaCount}
                        </div>
                      ) : (
                        <div className="absolute right-2 top-2 rounded-full bg-slate-950/60 p-2 text-white backdrop-blur-sm">
                          {isVideo ? <Play className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setGroupTab("media");
                  setIsGalleryOpen(true);
                }}
                className="themed-action-neutral rounded-full px-4 py-2 text-sm"
              >
                View all media
              </button>
            </>
          ) : (
            <p className="themed-subtitle text-sm">No media shared yet.</p>
          )}
        </div>
      )}

      {groupTab === "docs" && (
        <div className="space-y-5">
          {Object.keys(groupedSharedDocs).length ? (
            Object.entries(groupedSharedDocs).map(([monthLabel, items]) => (
              <div key={monthLabel}>
                <p className="themed-subtitle mb-3 text-xs font-semibold uppercase tracking-[0.18em]">
                  {monthLabel}
                </p>
                <div className="space-y-3">
                  {items.map((message) => (
                    <a
                      key={String(message._id || message.id)}
                      href={getResolvedAttachment(message)?.objectUrl || message.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="themed-panel-soft flex items-center gap-3 rounded-[22px] px-3 py-3"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/90 text-white">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="themed-title truncate text-sm font-medium">
                          {getResolvedAttachment(message)?.fileName || getMessageFileName(message)}
                        </p>
                        <p className="themed-subtitle text-xs">Tap to open document</p>
                      </div>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="themed-subtitle text-sm">No documents shared yet.</p>
          )}
        </div>
      )}

      {groupTab === "links" && (
        <div className="space-y-3">
          {sharedLinkItems.length ? (
            sharedLinkItems.map((item) => (
              <a
                key={`${item.messageId}-${item.url}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="themed-panel-soft flex items-start gap-3 rounded-[22px] px-3 py-3"
              >
                <div className="themed-icon-chip h-11 w-11 rounded-full">
                  <Link2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="themed-title truncate text-sm font-medium">{item.url}</p>
                  <p className="themed-subtitle text-xs">Shared by {item.sender}</p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
            ))
          ) : (
            <p className="themed-subtitle text-sm">No links shared yet.</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="themed-shell themed-chat-canvas flex h-full min-h-0 flex-col overflow-hidden">
      <MobileSafeHeader>
        <button
          type="button"
          onClick={onClose}
          className="themed-panel-soft inline-flex h-10 w-10 items-center justify-center rounded-2xl transition hover:opacity-90"
          aria-label="Close contact info"
        >
          <X className="themed-title h-4 w-4" />
        </button>
        <span className="themed-title flex-1 font-['Space_Grotesk'] text-xl font-semibold">
          {isGroupChat ? "Group Info" : "Contact Info"}
        </span>
      </MobileSafeHeader>

      <div className="no-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 md:p-5">
        {isGroupChat ? (
          <>
            <div className="themed-page-card rounded-[28px] p-5">
              <div className="flex flex-col items-center justify-center">
                <img
                  src={groupImagePreview}
                  alt="Group"
                  className="h-[110px] w-[110px] rounded-[28px] object-cover"
                />
              </div>
              <div className="flex items-center justify-center p-3">
                <div className="flex flex-col items-center gap-1 text-center">
                  <h5 className="themed-title font-['Space_Grotesk'] text-3xl font-semibold">
                    {selectedChatData?.name || "Untitled group"}
                  </h5>
                  <p className="themed-subtitle text-sm">
                    {groupMembers.length} members
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                {canEditGroup && (
                  <Button
                    variant="outline"
                    className="themed-action-neutral rounded-full"
                    onClick={() => setEditMode((current) => !current)}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    Edit group
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="themed-action-neutral rounded-full"
                  onClick={copyInviteLink}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Copy invite
                </Button>
              </div>
            </div>

            {editMode && canEditGroup && (
              <div className="themed-page-card space-y-4 rounded-[28px] p-5">
                <div className="flex items-center justify-between">
                  <span className="themed-title text-xl font-semibold">
                    Edit group
                  </span>
                  <label className="themed-action-neutral inline-flex cursor-pointer items-center rounded-full px-4 py-2 text-sm">
                    <ImagePlus className="mr-2 h-4 w-4" />
                    Change photo
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) =>
                        setGroupImageFile(event.target.files?.[0] || null)
                      }
                    />
                  </label>
                </div>
                <Input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Group name"
                  className="themed-input h-12 rounded-2xl"
                />
                <textarea
                  value={groupDescription}
                  onChange={(event) => setGroupDescription(event.target.value)}
                  placeholder="Describe this group"
                  className="themed-input min-h-[110px] w-full rounded-2xl px-4 py-3 text-sm outline-none"
                />
                <Button
                  onClick={saveGroupDetails}
                  disabled={savingGroup}
                  className="rounded-2xl bg-gradient-to-r from-[#8b5cf6] to-[#22d3ee] text-white"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {savingGroup ? "Saving..." : "Save changes"}
                </Button>
              </div>
            )}

            <div className="themed-page-card rounded-[28px] p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="themed-title text-xl font-semibold">
                  Members
                </span>
                <span className="themed-subtitle text-sm">
                  {groupMembers.length} total
                </span>
              </div>

              <div className="space-y-3">
                {groupMembers.map((member) => {
                  return (
                    <div
                      key={member._id}
                      className="themed-panel-soft flex items-center gap-3 rounded-2xl px-3 py-3"
                    >
                      <img
                        src={member.image || "/avatar.png"}
                        alt={member.displayName}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="themed-title truncate font-medium">
                          {member.displayName}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="themed-subtitle truncate text-xs">
                            {member.email || "Group member"}
                          </span>
                          <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-teal-400">
                            {member.role}
                          </span>
                        </div>
                      </div>
                      {canManageGroup &&
                        String(member._id) !== String(userInfo?.id) && (
                          <button
                            type="button"
                            className="themed-action-danger rounded-full px-3 py-2 text-xs"
                            onClick={() => removeGroupMember(member._id)}
                          >
                            Remove
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>

            {canInvitePeople && (
              <div className="themed-page-card rounded-[28px] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="themed-title text-xl font-semibold">
                    Add people
                  </span>
                  <Button
                    variant="outline"
                    className="themed-action-info rounded-full text-teal-400"
                    disabled={!selectedMemberIds.length || addingMembers}
                    onClick={addSelectedMembers}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {addingMembers ? "Sending..." : "Invite selected"}
                  </Button>
                </div>
                <Input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Search contacts..."
                  className="themed-input mb-3 h-12 rounded-2xl"
                />
                <div className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
                  {loadingContacts ? (
                    <p className="themed-subtitle text-sm">Loading contacts...</p>
                  ) : availableContacts.length ? (
                    availableContacts.map((contact) => {
                      const contactId = String(contact._id || contact.id);
                      const isSelected = selectedMemberIds.includes(contactId);
                      return (
                        <button
                          key={contactId}
                          type="button"
                          onClick={() => toggleSelectedMember(contactId)}
                          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                            isSelected
                              ? "border-cyan-300/40 bg-cyan-400/10"
                              : "border-white/10 bg-white/[0.03]"
                          }`}
                        >
                          <img
                            src={contact.image || "/avatar.png"}
                            alt={contact.email}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="themed-title truncate font-medium">
                              {[contact.firstName, contact.lastName]
                                .filter(Boolean)
                                .join(" ") || contact.email}
                            </p>
                            <p className="themed-subtitle truncate text-sm">
                              {contact.email}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="rounded-full bg-cyan-300 px-2 py-1 text-[10px] font-semibold text-slate-950">
                              Added
                            </div>
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <p className="themed-subtitle text-sm">
                      No contacts available to invite.
                    </p>
                  )}
                </div>
              </div>
            )}

            {renderSharedGallery()}

            <div className="themed-page-card space-y-3 rounded-[28px] p-5">
              <Button
                variant="outline"
                className="themed-action-danger flex w-full gap-2 rounded-2xl"
                onClick={leaveGroup}
              >
                <Users className="h-4 w-4" />
                Leave group
              </Button>
            </div>
          </>
        ) : (
          <>
              <div className="themed-page-card rounded-[28px] p-5">
                <div className="flex flex-col items-center justify-center">
                  <img
                    src={selectedChatData.image || "./avatar.png"}
                  alt="Profile"
                  className="h-[110px] w-[110px] rounded-[28px] object-cover"
                />
              </div>
              <div className="flex items-center justify-center p-3">
                <div className="flex flex-col items-center gap-1 text-center">
                  <h5 className="themed-title font-['Space_Grotesk'] text-3xl font-semibold">
                    {[selectedChatData.firstName, selectedChatData.lastName]
                      .filter(Boolean)
                      .join(" ") || selectedChatData.email}
                  </h5>
                  <p className="themed-subtitle text-sm">
                    {selectedChatData.email}
                  </p>
                  <p className="text-xs text-cyan-300">
                    {selectedChatData.status || "Offline"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-center gap-5">
                <button
                  type="button"
                  onClick={() => initiateCall("audio")}
                  className="flex items-center flex-col"
                >
                  <div className="themed-icon-chip h-[52px] w-[52px] rounded-full transition hover:scale-[1.03]">
                    <Phone className="h-[22px] w-[22px]" />
                  </div>
                  <span className="themed-subtitle mt-2 text-sm">Voice</span>
                </button>
                <button
                  type="button"
                  onClick={() => initiateCall("video")}
                  className="flex items-center flex-col"
                >
                  <div className="themed-icon-chip h-[52px] w-[52px] rounded-full transition hover:scale-[1.03]">
                    <Video className="h-[22px] w-[22px]" />
                  </div>
                  <span className="themed-subtitle mt-2 text-sm">Video</span>
                </button>
              </div>
            </div>

            <div className="themed-page-card rounded-[28px] p-5">
              <span className="themed-title text-xl font-semibold">About</span>
              <p className="themed-subtitle mt-3 text-sm leading-7">
                {selectedChatData.about || "No status set yet."}
              </p>
            </div>

              <div className="themed-page-card rounded-[28px] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="themed-title text-xl font-semibold">Security verification</span>
                    <p className="themed-subtitle mt-2 text-sm leading-7">
                      Verify key helps confirm that your chat and calls are secure with this contact.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="themed-action-info rounded-2xl"
                  onClick={
                    contactTrustState?.status === "verified"
                      ? clearFingerprintVerification
                      : verifyCurrentFingerprint
                  }
                >
                  {contactTrustState?.status === "verified"
                    ? "Verified secure chat"
                    : "Verify security"}
                </Button>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {loadingContactTrustState
                    ? "Checking security"
                    : contactTrustState?.status === "verified"
                      ? "Security verified"
                      : contactTrustState?.status === "changed"
                        ? "Security key changed"
                        : "Security not verified"}
                </p>
                <p className="mt-2 break-all text-sm text-white">
                  {formatFingerprintForDisplay(contactTrustState?.fingerprint) || "Fingerprint unavailable"}
                </p>
              </div>
            </div>

            {renderSharedGallery()}

            <div className="themed-page-card space-y-3 rounded-[28px] p-5">
              <Button
                variant="outline"
                className="themed-action-danger flex w-full gap-2 rounded-2xl"
                onClick={isBlocked ? handleUnblockUser : handleBlockUser}
              >
                <Ban className="h-4 w-4" />
                {isBlocked ? "Unblock contact" : "Block contact"}
              </Button>
              <Button
                variant="outline"
                className="themed-action-info flex w-full gap-2 rounded-2xl"
                onClick={deleteChat}
              >
                <Trash2 className="h-4 w-4" />
                Clear chat
              </Button>
              <Button
                variant="outline"
                className="themed-action-neutral flex w-full gap-2 rounded-2xl"
                onClick={unFriend}
              >
                <UserMinus className="h-4 w-4" />
                Remove friend
              </Button>
            </div>
          </>
        )}
      </div>

      {isGalleryOpen && (
        <div
          className="fixed inset-0 z-[119] bg-slate-950/88 p-4 backdrop-blur-sm"
          onClick={() => setIsGalleryOpen(false)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-[0_24px_80px_rgba(2,8,23,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
              <button
                type="button"
                onClick={() => setIsGalleryOpen(false)}
                className="rounded-full bg-white/10 p-2"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                {[
                  { id: "media", label: "Media" },
                  { id: "docs", label: "Docs" },
                  { id: "links", label: "Links" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setGroupTab(tab.id)}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      groupTab === tab.id ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {groupTab === "media" && (
                <div className="space-y-5">
                  {Object.keys(groupedSharedMedia).length ? (
                    Object.entries(groupedSharedMedia).map(([monthLabel, items]) => (
                      <div key={monthLabel}>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                          {monthLabel}
                        </p>
                        <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
                          {items.map((message) => {
                            const messageId = String(message._id || message.id);
                            const isVideo = getAttachmentKind(message) === "video";
                            return (
                              <button
                                key={messageId}
                                type="button"
                                onClick={() => setPreviewMedia(message)}
                                className="group relative aspect-square overflow-hidden rounded-[18px] bg-white/5 text-left"
                              >
                                {isVideo ? (
                                  <video
                                    src={getResolvedAttachment(message)?.objectUrl || message.fileUrl}
                                    className="h-full w-full object-cover"
                                    muted
                                  />
                                ) : (
                                  <img
                                    src={getResolvedAttachment(message)?.objectUrl || message.fileUrl}
                                    alt="Shared media"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                )}
                                <div className="absolute inset-0 bg-slate-950/20 transition group-hover:bg-slate-950/35" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                                  <div className="rounded-full bg-slate-950/70 p-3">
                                    {isVideo ? <Play className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-300">No media shared yet.</p>
                  )}
                </div>
              )}

              {groupTab === "docs" && (
                <div className="space-y-5">
                  {Object.keys(groupedSharedDocs).length ? (
                    Object.entries(groupedSharedDocs).map(([monthLabel, items]) => (
                      <div key={monthLabel}>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                          {monthLabel}
                        </p>
                        <div className="space-y-3">
                          {items.map((message) => (
                            <a
                              key={String(message._id || message.id)}
                              href={getResolvedAttachment(message)?.objectUrl || message.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-3 rounded-[22px] bg-white/5 px-3 py-3"
                            >
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/90 text-white">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white">
                                  {getResolvedAttachment(message)?.fileName || getMessageFileName(message)}
                                </p>
                                <p className="text-xs text-slate-300">Tap to open document</p>
                              </div>
                              <ExternalLink className="h-4 w-4 text-slate-300" />
                            </a>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-300">No documents shared yet.</p>
                  )}
                </div>
              )}

              {groupTab === "links" && (
                <div className="space-y-3">
                  {sharedLinkItems.length ? (
                    sharedLinkItems.map((item) => (
                      <a
                        key={`${item.messageId}-${item.url}`}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-start gap-3 rounded-[22px] bg-white/5 px-3 py-3"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                          <Link2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{item.url}</p>
                          <p className="text-xs text-slate-300">Shared by {item.sender}</p>
                        </div>
                        <ExternalLink className="h-4 w-4 shrink-0 text-slate-300" />
                      </a>
                    ))
                  ) : (
                    <p className="text-sm text-slate-300">No links shared yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewMedia && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className="mx-auto flex h-full max-w-4xl flex-col justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  Shared media
                </p>
                <p className="text-sm text-slate-300">
                  {new Date(previewMedia.timestamp || previewMedia.createdAt || Date.now()).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={getResolvedAttachment(previewMedia)?.objectUrl || previewMedia.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-white/10 p-3 text-white"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewMedia(null)}
                  className="rounded-full bg-white/10 p-3 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] bg-slate-950/70 shadow-[0_24px_80px_rgba(2,8,23,0.38)]">
              {getAttachmentKind(previewMedia) === "video" ? (
                <video
                  src={getResolvedAttachment(previewMedia)?.objectUrl || previewMedia.fileUrl}
                  className="max-h-[72vh] w-full bg-black object-contain"
                  controls
                  autoPlay
                />
              ) : (
                <img
                  src={getResolvedAttachment(previewMedia)?.objectUrl || previewMedia.fileUrl}
                  alt="Media preview"
                  className="max-h-[72vh] w-full bg-black object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const mapStateToProps = ({ Home, call }) => ({
  ...Home,
  ...call,
});

export default connect(mapStateToProps)(Detail);
