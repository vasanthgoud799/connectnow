import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import moment from "moment";
import { connect } from "react-redux";
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Check,
  Crown,
  Lock,
  Download,
  Forward,
  ExternalLink,
  Gift,
  Info,
  Mic,
  MoreHorizontal,
  MoreVertical,
  Music2,
  Pause,
  PenSquare,
  Phone,
  Pin,
  Play,
  Sparkles,
  Search,
  SendHorizonal,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Smile,
  Star,
  Trash2,
  Video,
  Wand2,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import AttachmentMenu from "./AttachmentMenu";
import RouteLoader from "@/components/ui/RouteLoader";
import ChatView from "./ChatView";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import EmptyChatState from "./EmptyChatState";
import Tick from "../List/ChatList/Tick";
import { useAppStore } from "@/store";
import { useSocket } from "@/context/SocketContext";
import useHandleReceiveMessage from "@/context/useHandleReceiveMessage";
import { apiClient } from "@/lib/api-client.js";
import { toast } from "sonner";
import {
  AI_AUTOCOMPLETE_ROUTE,
  AI_REWRITE_ROUTE,
  AI_SMART_REPLIES_ROUTE,
  AI_SUMMARIZE_ROUTE,
  AI_TONE_SUGGESTIONS_ROUTE,
  AI_TRANSLATE_ROUTE,
  CALLS_LOG_ROUTE,
  GET_ALL_MESSAGES_ROUTES,
  MARK_MESSAGES_SEEN_ROUTE,
  STARRED_MESSAGES_ROUTE,
  UPCOMING_BIRTHDAYS_ROUTE,
  UPLOAD_FILE_ROUTE,
} from "@/utils/constants.js";
import { isDirectCallBusy } from "@/store/actions/callActions";
import {
  decryptIncomingMessages,
  decryptMediaAttachmentToObjectUrl,
  encryptMediaFileForConversation,
  encryptTextForConversation,
  fetchConversationPublicKeys,
  hydrateMessagesFromCache,
  preloadRecentEncryptedMedia,
} from "@/crypto/e2eeService";
import { useTrustStatus } from "./hooks/useTrustStatus";
import {
  areSameMessage,
  mergeMessages,
  normalizeMessage,
  removeMessage,
} from "@/utils/chatMessages";

const EmojiPicker = lazy(() => import("emoji-picker-react"));
const AIAssistModal = lazy(() => import("./AIAssistModal"));
const CreatePollModal = lazy(() => import("./CreatePollModal"));
const ImageModal = lazy(() => import("./ImageModal"));
const ScheduleMessageModal = lazy(() => import("./ScheduleMessageModal"));
const PremiumUpgradeModal = lazy(() => import("../PremiumUpgradeModal"));

function formatDurationLabel(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(1, "0");
  const secs = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${mins}:${secs}`;
}

async function compressImageIfNeeded(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return file;
  }

  if (file.size <= 1.5 * 1024 * 1024) {
    return file;
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const maxDimension = 1600;
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
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );

    if (!blob || blob.size >= file.size) {
      return file;
    }

    const nextName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${nextName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function getSafeMediaUrl(url) {
  if (!url) return "";

  try {
    return encodeURI(url);
  } catch {
    return url;
  }
}

function normalizeAttachmentKind(type = "", fileType = "") {
  const lowerType = String(type).toLowerCase();
  const lowerFileType = String(fileType).toLowerCase();

  if (
    lowerType === "image" ||
    lowerType.startsWith("image/") ||
    lowerFileType.startsWith("image/")
  ) {
    return "image";
  }

  if (
    lowerType === "video" ||
    lowerType.startsWith("video/") ||
    lowerFileType.startsWith("video/")
  ) {
    return "video";
  }

  if (
    lowerType === "audio" ||
    lowerType.startsWith("audio/") ||
    lowerFileType.startsWith("audio/")
  ) {
    return "audio";
  }

  return "document";
}

function getDirectConversationKey(userA, userB) {
  if (!userA || !userB) return undefined;
  return [String(userA), String(userB)].sort().join(":");
}

function renderTextWithMentions(text = "") {
  return String(text)
    .split(/(@[a-zA-Z0-9._-]+)/g)
    .filter(Boolean)
    .map((segment, index) =>
      segment.startsWith("@") ? (
        <span
          key={`${segment}-${index}`}
          className="rounded bg-cyan-400/15 px-1.5 py-0.5 text-cyan-200"
        >
          {segment}
        </span>
      ) : (
        <React.Fragment key={`${segment}-${index}`}>{segment}</React.Fragment>
      )
    );
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏"];

function getUpcomingBirthdayMeta(birthdayValue) {
  if (!birthdayValue) return null;

  const birthday = new Date(birthdayValue);
  if (Number.isNaN(birthday.getTime())) return null;

  const now = new Date();
  const nextBirthday = new Date(
    now.getFullYear(),
    birthday.getMonth(),
    birthday.getDate(),
    9,
    0,
    0,
    0
  );

  if (nextBirthday < now) {
    nextBirthday.setFullYear(now.getFullYear() + 1);
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfBirthday = new Date(
    nextBirthday.getFullYear(),
    nextBirthday.getMonth(),
    nextBirthday.getDate()
  );

  return {
    nextBirthday,
    daysUntilBirthday: Math.round(
      (startOfBirthday - startOfToday) / (1000 * 60 * 60 * 24)
    ),
  };
}

function AudioMessageCard({ fileUrl, isVoiceNote }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const safeFileUrl = getSafeMediaUrl(fileUrl);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onError = () => setHasPlaybackError(true);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (error) {
      console.error("Error playing audio message:", error);
      toast.error("Unable to play this audio message.");
    }
  };

  const progress = duration ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <div className="themed-file-card w-full min-w-0 max-w-full rounded-[24px] p-3">
      <audio ref={audioRef} preload="metadata" src={safeFileUrl} />
      <div className="flex items-center gap-3">
        <div className="themed-panel-soft flex h-12 w-12 items-center justify-center rounded-full">
          <Music2 className="themed-attachment-icon h-5 w-5" />
        </div>
        <button
          type="button"
          onClick={togglePlayback}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-inherit transition hover:bg-black/15"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold">
              {isVoiceNote ? "Voice message" : "Audio file"}
            </p>
            <span className="text-xs opacity-70">
              {formatDurationLabel(isPlaying ? currentTime : duration || currentTime)}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-black/10">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-cyan-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
      {hasPlaybackError && (
        <div className="mt-3 flex gap-2">
          <a
            href={safeFileUrl}
            target="_blank"
            rel="noreferrer"
            className="themed-action-info rounded-full px-4 py-2 text-xs font-medium"
          >
            Open audio
          </a>
          <a
            href={safeFileUrl}
            download
            className="themed-action-neutral rounded-full px-4 py-2 text-xs font-medium"
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}

function DocumentMessageCard({ fileUrl, fileName: providedFileName = "" }) {
  const safeFileUrl = getSafeMediaUrl(fileUrl);
  const fileName =
    providedFileName ||
    decodeURIComponent(safeFileUrl.split("/").reverse()[0] || "Document");

  return (
    <div className="themed-file-card w-full min-w-0 max-w-full overflow-hidden rounded-[24px]">
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500 text-sm font-bold text-white">
          PDF
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{fileName}</p>
          <p className="text-xs opacity-70">Document attachment</p>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-white/10">
        <a
          href={safeFileUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition hover:bg-black/5"
        >
          <ExternalLink className="h-4 w-4" />
          Open
        </a>
        <a
          href={safeFileUrl}
          download
          className="flex items-center justify-center gap-2 border-l border-white/10 px-4 py-3 text-sm font-medium transition hover:bg-black/5"
        >
          <Download className="h-4 w-4" />
          Save as
        </a>
      </div>
    </div>
  );
}

function EncryptedMediaMessage({
  message,
  currentUserId,
  isMobile,
  onOpenImage,
}) {
  const [resolvedMedia, setResolvedMedia] = useState(message?.resolvedMedia || null);
  const [loading, setLoading] = useState(!message?.resolvedMedia);
  const [error, setError] = useState("");

  useEffect(() => {
    if (message?.resolvedMedia) {
      setResolvedMedia(message.resolvedMedia);
      setLoading(false);
      setError("");
      return undefined;
    }

    let ignore = false;

    const loadEncryptedMedia = async () => {
      try {
        setLoading(true);
        setError("");
        const nextMedia = await decryptMediaAttachmentToObjectUrl({
          message,
          currentUserId,
        });

        if (!ignore) {
          setResolvedMedia(nextMedia);
        }
      } catch (decryptError) {
        console.error("Unable to decrypt media attachment:", decryptError);
        if (!ignore) {
          setError("This media is unavailable on this device.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadEncryptedMedia();

    return () => {
      ignore = true;
    };
  }, [currentUserId, message]);

  const attachmentCaption = String(message.decryptedContent || "").trim();

  if (loading) {
    return (
      <div className="themed-file-card flex w-full min-w-0 max-w-[340px] items-center justify-center rounded-[24px] px-4 py-6 text-sm opacity-80">
        Decrypting media...
      </div>
    );
  }

  if (error || !resolvedMedia?.objectUrl) {
    return (
      <div className="themed-file-card flex w-full min-w-0 max-w-[340px] items-center justify-center rounded-[24px] px-4 py-6 text-sm text-rose-300">
        {error || "Encrypted media unavailable."}
      </div>
    );
  }

  if (message.messageType === "image") {
    return (
      <div className={`${isMobile ? "max-w-[58vw]" : "max-w-[340px]"} w-full min-w-0 space-y-3`}>
        <img
          src={resolvedMedia.objectUrl}
          alt={resolvedMedia.fileName || "Encrypted image"}
          className={`${isMobile ? "max-h-[190px]" : "max-h-[260px]"} block h-auto w-full rounded-2xl object-cover`}
          onClick={() => onOpenImage?.(resolvedMedia.objectUrl)}
        />
        {attachmentCaption ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {renderTextWithMentions(attachmentCaption)}
          </p>
        ) : null}
      </div>
    );
  }

  if (message.messageType === "video") {
    return (
      <div className={`${isMobile ? "max-w-[58vw]" : "max-w-[340px]"} w-full min-w-0 space-y-3`}>
        <video
          controls
          className={`${isMobile ? "max-h-[190px]" : "max-h-[260px]"} block h-auto w-full rounded-2xl object-cover`}
        >
          <source
            src={resolvedMedia.objectUrl}
            type={resolvedMedia.mimeType || "video/mp4"}
          />
        </video>
        {attachmentCaption ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {renderTextWithMentions(attachmentCaption)}
          </p>
        ) : null}
        <p className="text-xs opacity-75">Encrypted video attachment</p>
      </div>
    );
  }

  if (message.messageType === "audio") {
    return (
      <div className="w-full min-w-0 space-y-3">
        <AudioMessageCard
          fileUrl={resolvedMedia.objectUrl}
          isVoiceNote={String(message.content || "").toLowerCase().includes("voice")}
        />
        {attachmentCaption ? (
          <p className="whitespace-pre-wrap break-words px-1 text-sm leading-6">
            {renderTextWithMentions(attachmentCaption)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-3">
      <DocumentMessageCard
        fileUrl={resolvedMedia.objectUrl}
        fileName={resolvedMedia.fileName}
      />
      {attachmentCaption ? (
        <p className="whitespace-pre-wrap break-words px-1 text-sm leading-6">
          {renderTextWithMentions(attachmentCaption)}
        </p>
      ) : null}
    </div>
  );
}

function PollMessageCard({ message, currentUserId, onVote }) {
  const poll = message.meta?.poll;
  const [pendingOptionIds, setPendingOptionIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!poll) return null;

  const options = Array.isArray(poll.options) ? poll.options : [];
  const selectedOptionIds = options
    .filter((option) => (option.voterIds || []).map(String).includes(String(currentUserId)))
    .map((option) => String(option.id));
  const totalVotes = Number(poll.totalVotes || 0);
  const workingSelection = pendingOptionIds.length ? pendingOptionIds : selectedOptionIds;

  const toggleOption = (optionId) => {
    if (poll.allowMultipleAnswers) {
      setPendingOptionIds((currentIds) =>
        currentIds.includes(optionId)
          ? currentIds.filter((id) => id !== optionId)
          : [...currentIds, optionId]
      );
      return;
    }

    setPendingOptionIds([optionId]);
  };

  const submitVote = async () => {
    const nextSelection = pendingOptionIds.length ? pendingOptionIds : selectedOptionIds;
    if (!nextSelection.length) {
      toast.error("Select at least one option.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onVote?.(message, nextSelection);
      setPendingOptionIds([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="themed-file-card w-full min-w-0 max-w-full rounded-[24px] p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="themed-panel-soft flex h-12 w-12 items-center justify-center rounded-full">
          <BarChart3 className="themed-attachment-icon h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-6">{poll.question}</p>
          <p className="mt-1 text-xs opacity-70">
            {poll.allowMultipleAnswers ? "Multiple answers allowed" : "Choose one option"} • {totalVotes} vote{totalVotes === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {options.map((option) => {
          const optionId = String(option.id);
          const isSelected = workingSelection.includes(optionId);
          const percentage = totalVotes ? Math.round((Number(option.voterCount || 0) / totalVotes) * 100) : 0;

          return (
            <button
              key={optionId}
              type="button"
              onClick={() => toggleOption(optionId)}
              className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left transition ${
                isSelected ? "border-cyan-300/70 bg-cyan-400/10" : "border-white/10 bg-black/5"
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-2xl bg-cyan-400/12 transition-all"
                style={{ width: `${percentage}%` }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                      isSelected ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-white/20"
                    }`}
                  >
                    {isSelected && <Check className="h-4 w-4" />}
                  </div>
                  <span className="font-medium">{option.text}</span>
                </div>
                <span className="text-xs opacity-70">{percentage}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs opacity-70">
          {selectedOptionIds.length
            ? `You voted ${selectedOptionIds.length} option${selectedOptionIds.length === 1 ? "" : "s"}`
            : "No vote yet"}
        </span>
        <button
          type="button"
          onClick={submitVote}
          disabled={isSubmitting || !workingSelection.length}
          className="themed-action-info rounded-full px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : "Vote"}
        </button>
      </div>
    </div>
  );
}

function ReactionSummary({ reactions = [], currentUserId, onToggleReaction }) {
  const groupedReactions = Object.values(
    reactions.reduce((accumulator, reaction) => {
      const key = reaction.emoji;
      if (!accumulator[key]) {
        accumulator[key] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
        };
      }

      accumulator[key].count += 1;
      accumulator[key].users.push(String(reaction.userId?._id || reaction.userId));
      return accumulator;
    }, {})
  );

  if (!groupedReactions.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {groupedReactions.map((reaction) => {
        const isMine = reaction.users.includes(String(currentUserId));

        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => onToggleReaction(reaction.emoji, isMine)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              isMine
                ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                : "border-white/10 bg-black/5 text-inherit"
            }`}
          >
            <span>{reaction.emoji}</span>
            <span className="ml-1">{reaction.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function ForwardMessageModal({ isOpen, onClose, chats = [], onForward }) {
  const [search, setSearch] = useState("");

  if (!isOpen) return null;

  const filteredChats = chats.filter((chat) => {
    const participant = chat.participant || {};
    const title =
      chat.title ||
      chat.group?.name ||
      [participant.firstName, participant.lastName].filter(Boolean).join(" ") ||
      participant.email;

    return String(title || "").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="themed-modal-surface w-full max-w-xl rounded-[30px] p-6 shadow-[0_30px_80px_rgba(2,8,23,0.25)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="themed-title text-xl font-semibold">Forward message</p>
            <p className="themed-subtitle text-sm">Choose a chat to forward this message to.</p>
          </div>
          <button
            type="button"
            className="themed-panel-soft rounded-full p-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search chats..."
          className="themed-input mb-4 h-12 rounded-2xl"
        />

        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {filteredChats.map((chat) => {
            const participant = chat.participant || {};
            const title =
              chat.title ||
              chat.group?.name ||
              [participant.firstName, participant.lastName].filter(Boolean).join(" ") ||
              participant.email;
            const avatar = chat.group?.image || participant.image || "/avatar.png";

            return (
              <button
                key={chat.conversationKey}
                type="button"
                onClick={() => onForward(chat)}
                className="themed-conversation-card flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left"
              >
                <img src={avatar} alt="chat" className="h-11 w-11 rounded-full object-cover" />
                <div className="min-w-0">
                  <p className="themed-title truncate font-medium">{title}</p>
                  <p className="themed-subtitle truncate text-sm">
                    {chat.chatType === "group" ? "Group" : participant.email}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GroupCallPickerModal({
  isOpen,
  onClose,
  members = [],
  callType = "audio",
  onStartCall,
}) {
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedMemberIds([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const onlineMembers = members.filter((member) => member.isOnline);
  const offlineMembers = members.filter((member) => !member.isOnline);
  const title = callType === "video" ? "Start group video call" : "Start group audio call";

  const toggleMemberSelection = (memberId) => {
    setSelectedMemberIds((currentIds) =>
      currentIds.includes(memberId)
        ? currentIds.filter((id) => id !== memberId)
        : [...currentIds, memberId]
    );
  };

  const handleStartCall = () => {
    if (!selectedMemberIds.length) return;
    onStartCall?.(selectedMemberIds);
  };

  const renderMember = (member) => (
    <div
      key={member._id}
      className={`themed-conversation-card flex items-center gap-3 rounded-[22px] px-4 py-3 transition ${
        selectedMemberIds.includes(member._id) ? "ring-2 ring-cyan-400/50" : ""
      }`}
    >
      <img
        src={member.image || "/avatar.png"}
        alt={member.displayName}
        className="h-11 w-11 rounded-full object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="themed-title truncate font-medium">{member.displayName}</p>
        <p className="themed-subtitle truncate text-sm">
          {member.isOnline ? "Online now" : "Offline"}
        </p>
      </div>
      <button
        type="button"
        disabled={!member.isOnline}
        onClick={() => toggleMemberSelection(member._id)}
        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
          !member.isOnline
            ? "cursor-not-allowed bg-white/5 text-slate-500"
            : selectedMemberIds.includes(member._id)
              ? "bg-gradient-to-r from-[#8b5cf6] to-[#22d3ee] text-white"
              : "bg-white/5 text-slate-200 hover:bg-white/10"
        }`}
      >
        {!member.isOnline
          ? "Offline"
          : selectedMemberIds.includes(member._id)
            ? "Selected"
            : "Select"}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="themed-modal-surface w-full max-w-2xl rounded-[30px] p-6 shadow-[0_30px_80px_rgba(2,8,23,0.25)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="themed-title text-xl font-semibold">{title}</p>
            <p className="themed-subtitle text-sm">
              Pick the members you want to invite into this live call.
            </p>
          </div>
          <button
            type="button"
            className="themed-panel-soft rounded-full p-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="themed-title text-sm font-medium">Available now</p>
              <span className="themed-subtitle text-xs">
                {onlineMembers.length} online · {selectedMemberIds.length} selected
              </span>
            </div>
            <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
              {onlineMembers.length ? (
                onlineMembers.map(renderMember)
              ) : (
                <div className="themed-page-card rounded-[22px] px-4 py-6 text-center text-sm text-slate-400">
                  No group members are online right now.
                </div>
              )}
            </div>
          </div>

          {offlineMembers.length ? (
            <div>
              <p className="themed-title mb-2 text-sm font-medium">Offline</p>
              <div className="max-h-[180px] space-y-3 overflow-y-auto pr-1">
                {offlineMembers.map(renderMember)}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="themed-subtitle text-sm">
              Members will get a realtime invitation and can join from their current screen.
            </p>
            <button
              type="button"
              onClick={handleStartCall}
              disabled={!selectedMemberIds.length}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${
                selectedMemberIds.length
                  ? "bg-gradient-to-r from-[#8b5cf6] to-[#22d3ee] text-white shadow-[0_18px_38px_rgba(34,211,238,0.18)]"
                  : "cursor-not-allowed bg-white/5 text-slate-500"
              }`}
            >
              Start {callType === "video" ? "video" : "audio"} call
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const normalizeLookupValue = (value) => String(value || "").trim().toLowerCase();

const normalizeGroupMemberRecord = (member) => {
  const nestedUser =
    member?.user && typeof member.user === "object" && !Array.isArray(member.user)
      ? member.user
      : null;
  const baseUser = nestedUser || member || {};
  const memberId =
    baseUser?._id ||
    baseUser?.id ||
    (typeof member?.user === "string" ? member.user : null) ||
    (typeof member === "string" ? member : null);
  const firstName = baseUser?.firstName || "";
  const lastName = baseUser?.lastName || "";
  const email = baseUser?.email || "";
  const image = baseUser?.image || "/avatar.png";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || email || "Member";

  return {
    id: memberId ? String(memberId) : "",
    firstName,
    lastName,
    email,
    image,
    displayName,
  };
};

const matchesActiveUserRecord = (candidate = {}, activeUserItem = {}) => {
  const candidateId = normalizeLookupValue(candidate.id);
  const candidateEmail = normalizeLookupValue(candidate.email);
  const candidateDisplayName = normalizeLookupValue(candidate.displayName);
  const candidateFirstName = normalizeLookupValue(candidate.firstName);

  const activeUserId = normalizeLookupValue(activeUserItem.userId);
  const activeUserEmail = normalizeLookupValue(activeUserItem.email);
  const activeUserDisplayName = normalizeLookupValue(
    activeUserItem.displayName || activeUserItem.username
  );
  const activeUserUsername = normalizeLookupValue(activeUserItem.username);

  return (
    (candidateId && activeUserId && candidateId === activeUserId) ||
    (candidateEmail && activeUserEmail && candidateEmail === activeUserEmail) ||
    (candidateDisplayName &&
      (candidateDisplayName === activeUserDisplayName ||
        candidateDisplayName === activeUserUsername)) ||
    (candidateFirstName &&
      (candidateFirstName === activeUserUsername ||
        candidateFirstName === activeUserDisplayName))
  );
};

function StarredMessagesModal({
  isOpen,
  onClose,
  messages = [],
  onJumpToMessage,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="themed-modal-surface w-full max-w-2xl rounded-[30px] p-6 shadow-[0_30px_80px_rgba(2,8,23,0.25)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="themed-title text-xl font-semibold">Starred messages</p>
            <p className="themed-subtitle text-sm">
              Quickly jump back to saved messages in this conversation.
            </p>
          </div>
          <button
            type="button"
            className="themed-panel-soft rounded-full p-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
          {messages.length ? (
            messages.map((message) => (
              <button
                key={message._id || message.id}
                type="button"
                onClick={() => onJumpToMessage?.(String(message._id || message.id))}
                className="themed-conversation-card w-full rounded-[22px] px-4 py-3 text-left"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="themed-title truncate text-sm font-medium">
                    {message.isForwarded ? "Forwarded message" : "Saved message"}
                  </p>
                  <span className="themed-subtitle text-xs">
                    {moment(message.timestamp).format("lll")}
                  </span>
                </div>
                <p className="themed-subtitle line-clamp-2 text-sm">
                  {message.content ||
                    message.replyPreview?.content ||
                    message.meta?.poll?.question ||
                    "Attachment"}
                </p>
              </button>
            ))
          ) : (
            <div className="themed-page-card rounded-[24px] px-5 py-10 text-center">
              <p className="themed-title text-base font-medium">No starred messages yet</p>
              <p className="themed-subtitle mt-2 text-sm">
                Star important messages from the message menu to keep them handy.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chat({
  onToggleDetail,
  onToggleSearch,
  onBack,
  isMobile = false,
  activeUsers = [],
  callState,
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleOccasionType, setScheduleOccasionType] = useState("general");
  const [attachedFile, setAttachedFile] = useState({ file: null, type: null });
  const [selectedImage, setSelectedImage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [activeMessageMenuId, setActiveMessageMenuId] = useState(null);
  const [activeMessageMenuPosition, setActiveMessageMenuPosition] = useState({
    top: 0,
    left: 0,
  });
  const [showStarredModal, setShowStarredModal] = useState(false);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState([]);
  const [smartReplies, setSmartReplies] = useState([]);
  const [loadingSmartReplies, setLoadingSmartReplies] = useState(false);
  const [summaryModal, setSummaryModal] = useState({
    isOpen: false,
    loading: false,
    value: "",
  });
  const [aiAssistModal, setAiAssistModal] = useState({
    isOpen: false,
    loading: false,
    title: "",
    subtitle: "",
    value: "",
  });
  const [starredMessages, setStarredMessages] = useState([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [autocompleteSuggestion, setAutocompleteSuggestion] = useState("");
  const [loadingAutocomplete, setLoadingAutocomplete] = useState(false);
  const [toneSuggestions, setToneSuggestions] = useState(null);
  const [loadingToneSuggestions, setLoadingToneSuggestions] = useState(false);
  const [showGroupCallPicker, setShowGroupCallPicker] = useState(false);
  const [groupCallMode, setGroupCallMode] = useState("audio");
  const [showMobileHeaderMenu, setShowMobileHeaderMenu] = useState(false);
  const [groupE2eeBlockedMembers, setGroupE2eeBlockedMembers] = useState([]);
  const [isDecryptingMessages, setIsDecryptingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageLoadError, setMessageLoadError] = useState("");
  const [hasPendingNewMessages, setHasPendingNewMessages] = useState(false);
  const [isAtMessageBottom, setIsAtMessageBottom] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});

  const {
    userInfo,
    setUserInfo,
    selectedChatData,
    selectedConversationKey,
    focusedMessageId,
    setFocusedMessageId,
    setSelectedConversationKey,
    selectedChatMessages,
    chatSummaries,
    messagesByConversationKey,
    messagesLoadedByConversationKey,
    messagesLoadingByConversationKey,
    setConversationMessages,
    setConversationMessagesLoading,
  } = useAppStore();

  const selectedChatId = selectedChatData?._id || selectedChatData?.id;
  const isGroupChat = Boolean(selectedChatData?.isGroup);
  const selectedChatEmail = selectedChatData?.email;
  const selectedChatName = [selectedChatData?.firstName, selectedChatData?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const selectedChatBirthdayMeta = getUpcomingBirthdayMeta(selectedChatData?.birthday);
  const resolvedConversationKey = useMemo(() => {
    if (selectedConversationKey) return selectedConversationKey;
    if (isGroupChat && selectedChatId) return `group:${selectedChatId}`;

    return (
      chatSummaries.find((chat) => {
        const participantId = chat.participant?._id || chat.participant?.id;
        return String(participantId) === String(selectedChatId);
      })?.conversationKey ||
      getDirectConversationKey(userInfo?.id, selectedChatId)
    );
  }, [chatSummaries, isGroupChat, selectedChatId, selectedConversationKey, userInfo?.id]);

  const socket = useSocket();
  const messageListRef = useRef(null);
  const composerRef = useRef(null);
  const latestMessagesRequestRef = useRef(0);
  const lastRenderedMessageIdRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const sendingMessageRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const typingActiveRef = useRef(false);
  const lastTypingEmitRef = useRef(0);

  useHandleReceiveMessage(socket);

  const keepLatestMessageVisible = useCallback(
    (behavior = "auto") => {
      if (!isMobile) return;

      const composerInput = composerRef.current?.querySelector(
        '[data-testid="chat-composer-input"]'
      );

      if (!composerInput || document.activeElement !== composerInput) {
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (isAtMessageBottom) {
            messageListRef.current?.scrollToBottom(behavior);
          }
        });
      });
    },
    [isAtMessageBottom, isMobile]
  );

  useEffect(() => {
    const node = composerRef.current;
    if (!node) return undefined;

    const setComposerHeight = () => {
      document.documentElement.style.setProperty(
        "--chat-composer-height",
        `${Math.ceil(node.getBoundingClientRect().height)}px`
      );
    };

    setComposerHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", setComposerHeight);
      return () => window.removeEventListener("resize", setComposerHeight);
    }

    const observer = new ResizeObserver(setComposerHeight);
    observer.observe(node);
    window.addEventListener("resize", setComposerHeight);
    window.visualViewport?.addEventListener("resize", setComposerHeight);
    window.visualViewport?.addEventListener("scroll", setComposerHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", setComposerHeight);
      window.visualViewport?.removeEventListener("resize", setComposerHeight);
      window.visualViewport?.removeEventListener("scroll", setComposerHeight);
    };
  }, [
    attachedFile.file,
    autocompleteSuggestion,
    editingMessageId,
    isMobile,
    isRecordingAudio,
    replyingToMessage,
    smartReplies.length,
    text,
  ]);

  useEffect(() => {
    if (!activeMessageMenuId) return undefined;

    const closeMenu = () => setActiveMessageMenuId(null);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [activeMessageMenuId]);

  const activeCallUser = useMemo(
    () =>
      isGroupChat
        ? null
        : (activeUsers || []).find((activeUserItem) =>
            matchesActiveUserRecord(
              {
                id: selectedChatId,
                email: selectedChatEmail,
                displayName: selectedChatName,
                firstName: selectedChatData?.firstName,
              },
              activeUserItem
            )
          ),
    [activeUsers, isGroupChat, selectedChatData, selectedChatEmail, selectedChatId, selectedChatName]
  );

  const typingPayload = useMemo(
    () => ({
      chatType: isGroupChat ? "group" : "direct",
      conversationKey: resolvedConversationKey,
      groupId: isGroupChat ? selectedChatId : undefined,
      recipientId: isGroupChat ? undefined : selectedChatId,
    }),
    [isGroupChat, resolvedConversationKey, selectedChatId]
  );

  const emitTypingState = useCallback(
    (isTyping) => {
      if (!socket || !resolvedConversationKey || !selectedChatId) return;

      const eventName = isTyping ? "typing:start" : "typing:stop";
      socket.emit(eventName, typingPayload);
      typingActiveRef.current = isTyping;
      lastTypingEmitRef.current = Date.now();
    },
    [resolvedConversationKey, selectedChatId, socket, typingPayload]
  );

  const scheduleTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (typingActiveRef.current) {
        emitTypingState(false);
      }
    }, 1800);
  }, [emitTypingState]);

  const handleComposerTextChange = useCallback(
    (event) => {
      const nextValue = event.target.value;
      setText(nextValue);

      if (!nextValue.trim() || editingMessageId) {
        if (typingActiveRef.current) {
          emitTypingState(false);
        }
        return;
      }

      const now = Date.now();
      if (!typingActiveRef.current || now - lastTypingEmitRef.current > 1600) {
        emitTypingState(true);
      }
      scheduleTypingStop();
    },
    [editingMessageId, emitTypingState, scheduleTypingStop]
  );

  const stopTypingNow = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (typingActiveRef.current) {
      emitTypingState(false);
    }
  }, [emitTypingState]);

  useEffect(() => stopTypingNow, [resolvedConversationKey, stopTypingNow]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleTypingUpdate = (payload = {}) => {
      if (!payload?.conversationKey || payload.conversationKey !== resolvedConversationKey) {
        return;
      }

      const typingUserId = payload.userId || payload.user?._id || payload.user?.id;
      if (!typingUserId || String(typingUserId) === String(userInfo?.id)) return;

      setTypingUsers((current) => {
        const next = { ...current };
        if (payload.isTyping) {
          next[String(typingUserId)] = {
            name: payload.name || payload.user?.firstName || payload.user?.email || "Someone",
            expiresAt: Date.now() + 3500,
          };
        } else {
          delete next[String(typingUserId)];
        }
        return next;
      });
    };

    socket.on("typing:update", handleTypingUpdate);

    const intervalId = setInterval(() => {
      const now = Date.now();
      setTypingUsers((current) => {
        const entries = Object.entries(current).filter(
          ([, value]) => Number(value.expiresAt || 0) > now
        );
        return entries.length === Object.keys(current).length
          ? current
          : Object.fromEntries(entries);
      });
    }, 1200);

    return () => {
      socket.off("typing:update", handleTypingUpdate);
      clearInterval(intervalId);
    };
  }, [resolvedConversationKey, socket, userInfo?.id]);

  const isSelectedUserOnline =
    Boolean(activeCallUser) || selectedChatData?.status === "Online";
  const hasGroupEncryptionWarning =
    isGroupChat && groupE2eeBlockedMembers.length > 0;
  const {
    contactTrustState,
    loadingContactTrustState,
    verifyCurrentFingerprint: handleVerifyCurrentFingerprint,
    clearFingerprintVerification: handleClearFingerprintVerification,
  } = useTrustStatus({
    isGroupChat,
    selectedChatId,
    currentUserId: userInfo?.id,
    displayName: selectedChatName || selectedChatEmail || "Contact",
  });

  const groupCallableMembers = useMemo(() => {
    if (!isGroupChat) return [];

    return (selectedChatData?.members || [])
      .map((member) => {
        const normalizedMember = normalizeGroupMemberRecord(member);
        const memberId = normalizedMember.id;
        if (!memberId || String(memberId) === String(userInfo?.id)) return null;

        const activeUser = (activeUsers || []).find((activeUserItem) =>
          matchesActiveUserRecord(
            {
              id: memberId,
              email: normalizedMember.email,
              displayName: normalizedMember.displayName,
              firstName: normalizedMember.firstName,
            },
            activeUserItem
          )
        );

        return {
          _id: memberId,
          displayName: normalizedMember.displayName,
          email: normalizedMember.email,
          image: normalizedMember.image,
          isOnline: Boolean(activeUser),
          activeUser,
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.isOnline) - Number(a.isOnline));
  }, [activeUsers, isGroupChat, selectedChatData?.members, userInfo?.id]);

  const waitForConversationKeys = async (missingRecipientIds = []) => {
    if (!missingRecipientIds.length) return false;

    const { requestRemoteE2eeInit } = await import("@/utils/wssConnection/wssConnection");
    requestRemoteE2eeInit({ userIds: missingRecipientIds });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const conversationKeys = await fetchConversationPublicKeys({
        userId: isGroupChat ? undefined : selectedChatId,
        groupId: isGroupChat ? selectedChatId : undefined,
      });

      const stillMissing = missingRecipientIds.filter(
        (recipientId) =>
          isGroupChat
            ? !conversationKeys[String(recipientId)]?.publicKeyJwk
            : !conversationKeys[String(recipientId)]?.ecdhPublicKeyJwk
      );

      if (!stillMissing.length) {
        return true;
      }
    }

    return false;
  };

  useEffect(() => {
    let ignore = false;

    const loadGroupEncryptionStatus = async () => {
      if (!isGroupChat || !selectedChatId || !userInfo?.id) {
        setGroupE2eeBlockedMembers([]);
        return;
      }

      try {
        const conversationKeys = await fetchConversationPublicKeys({
          groupId: selectedChatId,
        });
        const missingMembers = (selectedChatData?.members || [])
          .map((member) => {
            const memberId = String(member.user?._id || member.user || member._id || member.id);
            const keyRecord = conversationKeys[memberId];
            const displayName =
              member.user?.firstName ||
              member.firstName ||
              member.user?.email ||
              member.email ||
              "A group member";

            return !keyRecord?.publicKeyJwk ? { id: memberId, displayName } : null;
          })
          .filter(Boolean)
          .filter((member) => String(member.id) !== String(userInfo.id));

        if (!ignore) {
          setGroupE2eeBlockedMembers(missingMembers);
        }
      } catch (error) {
        if (!ignore) {
          setGroupE2eeBlockedMembers([]);
        }
      }
    };

    loadGroupEncryptionStatus();

    return () => {
      ignore = true;
    };
  }, [isGroupChat, selectedChatData?.members, selectedChatId, userInfo?.id]);
  const canMessageDirectUser =
    isGroupChat ||
    (userInfo?.friends || []).some((friendId) => String(friendId) === String(selectedChatId));
  const selectedBirthdayReminder = useMemo(
    () =>
      upcomingBirthdays.find(
        (birthdayItem) => String(birthdayItem._id || birthdayItem.friendId) === String(selectedChatId)
      )?.reminder || selectedChatBirthdayMeta,
    [selectedChatBirthdayMeta, selectedChatId, upcomingBirthdays]
  );
  const canSend = text.trim().length > 0 || Boolean(attachedFile.file) || Boolean(editingMessageId);
  const typingLabel = useMemo(() => {
    const activeTypingUsers = Object.values(typingUsers);
    if (!activeTypingUsers.length) return "";
    if (!isGroupChat) return "Typing...";
    const firstName = activeTypingUsers[0]?.name || "Someone";
    return activeTypingUsers.length === 1
      ? `${firstName} is typing...`
      : `${firstName} and ${activeTypingUsers.length - 1} others are typing...`;
  }, [isGroupChat, typingUsers]);
  const isUserBlocked = () =>
    userInfo?.blockedUsers?.includes(selectedChatId);
  const aiEnabled = Boolean(userInfo?.aiPreferences?.enabled);
  const subscriptionPlan = userInfo?.subscription?.plan || "free";
  const subscriptionExpiresAt = userInfo?.subscription?.expiresAt;
  const isPremiumUser =
    subscriptionPlan === "premium" &&
    (!subscriptionExpiresAt || new Date(subscriptionExpiresAt).getTime() > Date.now());
  const aiRemaining = Number(userInfo?.aiRemaining ?? userInfo?.aiDailyLimit ?? 0);

  const openPremiumModal = () => {
    setShowPremiumModal(true);
  };

  const syncSubscriptionStateFromAI = (subscriptionPayload) => {
    if (!subscriptionPayload) return;

    setUserInfo({
      ...userInfo,
      subscription: {
        plan: subscriptionPayload.plan,
        expiresAt: subscriptionPayload.expiresAt,
      },
      aiUsage: subscriptionPayload.aiUsage,
      aiDailyLimit: subscriptionPayload.dailyLimit,
      aiRemaining: subscriptionPayload.remaining,
    });
  };

  useEffect(() => {
    if (!selectedChatId || !userInfo?.id) return;

    const requestId = ++latestMessagesRequestRef.current;
    const cachedMessages = Array.isArray(messagesByConversationKey?.[resolvedConversationKey])
      ? messagesByConversationKey[resolvedConversationKey]
      : [];

    if (
      resolvedConversationKey &&
      useAppStore.getState().selectedConversationKey !== resolvedConversationKey
    ) {
      setSelectedConversationKey(resolvedConversationKey);
    }

    if (resolvedConversationKey && messagesLoadedByConversationKey?.[resolvedConversationKey]) {
      return;
    }

    const loadMessages = async () => {
      try {
        setMessageLoadError("");
        const pendingConversationKey =
          resolvedConversationKey || (isGroupChat ? `group:${selectedChatId}` : null);
        if (pendingConversationKey) {
          setConversationMessagesLoading(pendingConversationKey, true);
        }
        if (!cachedMessages.length) {
          setIsDecryptingMessages(true);
        }

        const response = await apiClient.post(
          GET_ALL_MESSAGES_ROUTES,
          isGroupChat ? { groupId: selectedChatId } : { id: selectedChatId },
          { withCredentials: true }
        );

        if (requestId !== latestMessagesRequestRef.current) return;

        const rawMessages = Array.isArray(response.data?.messages)
          ? response.data.messages.map((message) =>
              normalizeMessage(message, {
                conversationKey:
                  response.data?.conversationKey || pendingConversationKey,
              })
            )
          : [];
        const nextConversationKey =
          response.data?.conversationKey || pendingConversationKey;

        if (!nextConversationKey) return;

        if (response.data?.conversationKey) {
          setSelectedConversationKey(response.data.conversationKey);
        }

        const hydratedMessages = await hydrateMessagesFromCache({
          messages: rawMessages,
        });

        if (requestId !== latestMessagesRequestRef.current) return;
        setConversationMessages(nextConversationKey, hydratedMessages, { loaded: false });

        const decryptedMessages = await decryptIncomingMessages({
          messages: rawMessages,
          currentUserId: userInfo?.id,
        });

        if (requestId !== latestMessagesRequestRef.current) return;
        setConversationMessages(nextConversationKey, decryptedMessages);

        preloadRecentEncryptedMedia({
          messages: decryptedMessages,
          currentUserId: userInfo?.id,
          limit: 8,
        })
          .then((prefetchedMessages) => {
            if (requestId !== latestMessagesRequestRef.current) return;
            setConversationMessages(nextConversationKey, prefetchedMessages);
          })
          .catch((error) => {
            console.error("Error preloading encrypted media:", error);
          });
      } catch (err) {
        console.error("Error fetching messages:", err);
        setMessageLoadError("Unable to load messages right now.");
      } finally {
        if (resolvedConversationKey) {
          setConversationMessagesLoading(resolvedConversationKey, false);
        }
        if (requestId === latestMessagesRequestRef.current) {
          setIsDecryptingMessages(false);
        }
      }
    };

    loadMessages();
  }, [
    isGroupChat,
    resolvedConversationKey,
    selectedChatId,
    setConversationMessages,
    setConversationMessagesLoading,
    setSelectedConversationKey,
    userInfo?.id,
  ]);

  useEffect(() => {
    if (!socket || !selectedChatId || !resolvedConversationKey) return;

    socket.emit("join_conversation", {
      otherUserId: isGroupChat ? null : selectedChatId,
      conversationKey: resolvedConversationKey,
    });

    apiClient
      .post(
        MARK_MESSAGES_SEEN_ROUTE,
        {
          userId: isGroupChat ? null : selectedChatId,
          conversationKey: resolvedConversationKey,
        },
        { withCredentials: true }
      )
      .catch((error) => console.error("Error marking messages seen:", error));

    return () => {
      socket.emit("leave_conversation", {
        otherUserId: isGroupChat ? null : selectedChatId,
        conversationKey: resolvedConversationKey,
      });
    };
  }, [isGroupChat, resolvedConversationKey, socket, selectedChatId]);

  useEffect(() => {
    apiClient
      .get(UPCOMING_BIRTHDAYS_ROUTE, { withCredentials: true })
      .then((response) => {
        setUpcomingBirthdays(response.data.birthdays || []);
      })
      .catch((error) => {
        console.error("Error loading upcoming birthdays:", error);
      });
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleScheduledMessageDue = (payload) => {
      if (payload?.failed) {
        toast.error(payload.error || "Scheduled message could not be sent.");
        return;
      }

      toast.success("Scheduled message sent.");
    };

    const handleBirthdayReminder = (payload) => {
      const reminders = payload?.reminders || [];
      if (!reminders.length) return;

      setUpcomingBirthdays((currentBirthdays) => {
        const reminderMap = new Map(
          currentBirthdays.map((birthdayItem) => [
            String(birthdayItem._id || birthdayItem.friendId),
            birthdayItem,
          ])
        );

        reminders.forEach((reminder) => {
          reminderMap.set(String(reminder.friendId), {
            _id: reminder.friendId,
            firstName: reminder.friendName,
            reminder,
            birthday: reminder.birthday,
          });
        });

        return [...reminderMap.values()];
      });

      const todayReminder = reminders.find((reminder) => reminder.isToday);
      if (todayReminder) {
        toast.success(`${todayReminder.friendName} has a birthday today.`);
      }
    };

    socket.on("scheduled_message_due", handleScheduledMessageDue);
    socket.on("birthday_reminder", handleBirthdayReminder);

    return () => {
      socket.off("scheduled_message_due", handleScheduledMessageDue);
      socket.off("birthday_reminder", handleBirthdayReminder);
    };
  }, [socket]);

  useEffect(() => {
    if (
      !aiEnabled ||
      !isPremiumUser ||
      !selectedConversationKey ||
      !selectedChatData ||
      text.trim()
    ) {
      setSmartReplies([]);
      return;
    }

    let ignore = false;

    const loadSmartReplies = async () => {
      try {
        setLoadingSmartReplies(true);
        const response = await apiClient.post(
          AI_SMART_REPLIES_ROUTE,
          { conversationKey: selectedConversationKey },
          { withCredentials: true }
        );

        if (!ignore) {
          setSmartReplies(response.data.suggestions || []);
          syncSubscriptionStateFromAI(response.data.subscription);
        }
      } catch (error) {
        console.error("Error loading smart replies:", error);
        if (!ignore) {
          setSmartReplies([]);
        }
      } finally {
        if (!ignore) {
          setLoadingSmartReplies(false);
        }
      }
    };

    loadSmartReplies();
    return () => {
      ignore = true;
    };
  }, [aiEnabled, selectedConversationKey, selectedChatData, selectedChatMessages?.length, text]);

  useEffect(() => {
    if (
      !aiEnabled ||
      !isPremiumUser ||
      !selectedConversationKey ||
      !selectedChatData ||
      !text.trim() ||
      text.trim().length < 6 ||
      attachedFile.file ||
      isRecordingAudio ||
      editingMessageId
    ) {
      setAutocompleteSuggestion("");
      return;
    }

    let ignore = false;
    const timeoutId = setTimeout(async () => {
      try {
        setLoadingAutocomplete(true);
        const response = await apiClient.post(
          AI_AUTOCOMPLETE_ROUTE,
          {
            conversationKey: selectedConversationKey,
            text,
          },
          { withCredentials: true }
        );

        if (!ignore) {
          const suggestion = String(response.data.text || "").trim();
          setAutocompleteSuggestion(
            suggestion && suggestion !== text.trim() ? suggestion : ""
          );
          syncSubscriptionStateFromAI(response.data.subscription);
        }
      } catch (error) {
        console.error("Error loading autocomplete suggestion:", error);
        if (!ignore) {
          setAutocompleteSuggestion("");
        }
      } finally {
        if (!ignore) {
          setLoadingAutocomplete(false);
        }
      }
    }, 650);

    return () => {
      ignore = true;
      clearTimeout(timeoutId);
    };
  }, [
    aiEnabled,
    attachedFile.file,
    editingMessageId,
    isPremiumUser,
    isRecordingAudio,
    selectedChatData,
    selectedConversationKey,
    text,
  ]);

  useEffect(() => {
    if (
      !aiEnabled ||
      !isPremiumUser ||
      !text.trim() ||
      text.trim().length < 4 ||
      attachedFile.file ||
      isRecordingAudio
    ) {
      setToneSuggestions(null);
      return;
    }

    let ignore = false;
    const timeoutId = setTimeout(async () => {
      try {
        setLoadingToneSuggestions(true);
        const response = await apiClient.post(
          AI_TONE_SUGGESTIONS_ROUTE,
          { text },
          { withCredentials: true }
        );

        if (!ignore) {
          setToneSuggestions({
            formal: response.data.formal || "",
            friendly: response.data.friendly || "",
            concise: response.data.concise || "",
          });
          syncSubscriptionStateFromAI(response.data.subscription);
        }
      } catch (error) {
        console.error("Error loading tone suggestions:", error);
        if (!ignore) {
          setToneSuggestions(null);
        }
      } finally {
        if (!ignore) {
          setLoadingToneSuggestions(false);
        }
      }
    }, 450);

    return () => {
      ignore = true;
      clearTimeout(timeoutId);
    };
  }, [aiEnabled, attachedFile.file, isPremiumUser, isRecordingAudio, text]);

  useEffect(() => {
    const container = messageListRef.current?.container;
    if (!container) return undefined;

    const handleScroll = () => {
      const threshold = 48;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const nextAtBottom = distanceFromBottom <= threshold;
      setIsAtMessageBottom(nextAtBottom);
      if (nextAtBottom) {
        setHasPendingNewMessages(false);
      }
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [resolvedConversationKey]);

  useEffect(() => {
    const latestMessage = selectedChatMessages[selectedChatMessages.length - 1];
    const latestMessageId = latestMessage?._id || latestMessage?.id || null;
    if (!latestMessageId) return;

    const previousMessageId = lastRenderedMessageIdRef.current;
    lastRenderedMessageIdRef.current = latestMessageId;

    if (!previousMessageId) {
      messageListRef.current?.scrollToBottom("auto");
      return;
    }

    if (String(previousMessageId) === String(latestMessageId)) {
      return;
    }

    const latestSenderId =
      typeof latestMessage.sender === "string"
        ? latestMessage.sender
        : latestMessage.sender?._id || latestMessage.sender?.id;
    const isOwnMessage = String(latestSenderId || "") === String(userInfo?.id || "");

    if (isAtMessageBottom || isOwnMessage) {
      messageListRef.current?.scrollToBottom("smooth");
      setHasPendingNewMessages(false);
      return;
    }

    setHasPendingNewMessages(true);
  }, [isAtMessageBottom, selectedChatMessages, userInfo?.id]);

  useEffect(() => {
    if (!focusedMessageId) return;

    const timeoutId = setTimeout(() => {
      messageListRef.current?.scrollToMessageId(focusedMessageId);

      setTimeout(() => {
        setFocusedMessageId(undefined);
      }, 1800);
    }, 60);

    return () => clearTimeout(timeoutId);
  }, [focusedMessageId, setFocusedMessageId]);

  useEffect(() => {
    if (!isMobile) return undefined;

    const composerInput = composerRef.current?.querySelector(
      '[data-testid="chat-composer-input"]'
    );
    if (!composerInput) return undefined;

    const handleFocus = () => keepLatestMessageVisible("auto");
    const handleViewportChange = () => keepLatestMessageVisible("auto");

    composerInput.addEventListener("focus", handleFocus);
    window.addEventListener("focusin", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);

    return () => {
      composerInput.removeEventListener("focus", handleFocus);
      window.removeEventListener("focusin", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, [isMobile, keepLatestMessageVisible, resolvedConversationKey]);

  useEffect(() => {
    let intervalId;

    if (isRecordingAudio) {
      intervalId = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isRecordingAudio]);

  useEffect(() => {
    return () => {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (showStarredModal && selectedConversationKey) {
      fetchStarredMessages();
    }
  }, [showStarredModal, selectedConversationKey]);

  useEffect(() => {
    if (!attachedFile.file) {
      setAttachmentPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(attachedFile.file);
    setAttachmentPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [attachedFile.file]);

  const uploadFile = async (file, options = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("privateMedia", "true");
    if (options.encryptedMedia) {
      formData.append("encryptedMedia", "true");
    }
    if (options.originalMimeType) {
      formData.append("originalMimeType", options.originalMimeType);
    }

    const response = await apiClient.post(UPLOAD_FILE_ROUTE, formData, {
      withCredentials: true,
      onUploadProgress: (progressEvent) => {
        if (typeof options.onProgress !== "function") return;
        const total = Number(progressEvent.total || file.size || 0);
        const loaded = Number(progressEvent.loaded || 0);
        if (!total) return;
        options.onProgress(Math.min(100, Math.round((loaded / total) * 100)));
      },
    });

    return response.data;
  };

  const fetchStarredMessages = async () => {
    try {
      setIsDecryptingMessages(true);
      const response = await apiClient.get(STARRED_MESSAGES_ROUTE, {
        params: {
          conversationKey: selectedConversationKey,
        },
        withCredentials: true,
      });

      const cachedMessages = await hydrateMessagesFromCache({
        messages: response.data.messages || [],
      });
      setStarredMessages(cachedMessages);

      const decryptedMessages = await decryptIncomingMessages({
        messages: response.data.messages || [],
        currentUserId: userInfo?.id,
      });
      setStarredMessages(decryptedMessages);
      preloadRecentEncryptedMedia({
        messages: decryptedMessages,
        currentUserId: userInfo?.id,
        limit: 8,
      })
        .then((hydratedMessages) => {
          setStarredMessages(hydratedMessages);
        })
        .catch((error) => {
          console.error("Error preloading starred encrypted media:", error);
        });
    } catch (error) {
      console.error("Error fetching starred messages:", error);
      toast.error("Unable to load starred messages.");
    } finally {
      setIsDecryptingMessages(false);
    }
  };

  const handleEmojiClick = (emojiData) => {
    setText((prev) => prev + emojiData.emoji);
    setShowEmoji(false);
  };

  const clearAttachedFile = () => {
    setAttachedFile({ file: null, type: null });
  };

  const clearReplyState = () => {
    setReplyingToMessage(null);
    setEditingMessageId(null);
  };

  const mergeConversationMessageSet = (conversationKey, incomingMessages, options = {}) => {
    if (!conversationKey) return;

    const currentMessages = Array.isArray(
      useAppStore.getState().messagesByConversationKey?.[conversationKey]
    )
      ? useAppStore.getState().messagesByConversationKey[conversationKey]
      : [];

    setConversationMessages(
      conversationKey,
      mergeMessages(currentMessages, incomingMessages),
      { loaded: options.loaded ?? true }
    );
  };

  const patchLocalMessage = (conversationKey, messageLike, updater) => {
    if (!conversationKey || !messageLike) return;

    const currentMessages = Array.isArray(
      useAppStore.getState().messagesByConversationKey?.[conversationKey]
    )
      ? useAppStore.getState().messagesByConversationKey[conversationKey]
      : [];

    mergeConversationMessageSet(
      conversationKey,
      currentMessages
        .filter((message) => areSameMessage(message, messageLike))
        .map((message) => ({ ...message, ...updater }))
    );
  };

  const removeLocalMessage = (conversationKey, messageLike) => {
    if (!conversationKey || !messageLike) return;

    const currentMessages = Array.isArray(
      useAppStore.getState().messagesByConversationKey?.[conversationKey]
    )
      ? useAppStore.getState().messagesByConversationKey[conversationKey]
      : [];

    setConversationMessages(conversationKey, removeMessage(currentMessages, messageLike));
  };

  const buildEncryptedPayload = async (
    plaintext,
    { payloadType = "text", preserveWhitespace = false, ...overrides } = {}
  ) => {
    const normalizedPlaintext = preserveWhitespace
      ? String(plaintext || "")
      : String(plaintext || "").trim();

    if (!normalizedPlaintext.trim()) {
      return { content: normalizedPlaintext, encryption: null };
    }

    return encryptTextForConversation({
      plaintext: normalizedPlaintext,
      currentUserId: userInfo?.id,
      userId: overrides.userId || (!isGroupChat ? selectedChatId : undefined),
      groupId: overrides.groupId || (isGroupChat ? selectedChatId : undefined),
      payloadType,
    });
  };

  const buildForwardPayload = async (message, chat) => {
    const isTargetGroup = chat.chatType === "group";
    const participant = chat.participant || {};
    let encryptedPayload = null;
    let forwardedMeta = message.meta;
    let forwardedFileUrl = message.fileUrl;
    let forwardedStorageProvider = message.storageProvider;
    let forwardedStoragePath = message.storagePath;
    let forwardedStorageBucket = message.storageBucket;
    let forwardedMediaEncryption = message.mediaEncryption || null;

    if (message.messageType === "text") {
      encryptedPayload = await encryptTextForConversation({
        plaintext: message.decryptedContent || message.content || "",
        currentUserId: userInfo?.id,
        userId: isTargetGroup ? undefined : participant._id || participant.id,
        groupId: isTargetGroup ? chat.group?._id : undefined,
      });
    } else if (message.messageType === "poll") {
      const poll = message.meta?.poll || {};
      encryptedPayload = await encryptTextForConversation({
        plaintext: JSON.stringify({
          question: poll.question || "",
          options: Array.isArray(poll.options)
            ? poll.options.map((option) => ({ text: option.text || "" }))
            : [],
        }),
        currentUserId: userInfo?.id,
        userId: isTargetGroup ? undefined : participant._id || participant.id,
        groupId: isTargetGroup ? chat.group?._id : undefined,
        payloadType: "poll",
      });
      forwardedMeta = {
        ...message.meta,
        poll: {
          allowMultipleAnswers: Boolean(message.meta?.poll?.allowMultipleAnswers),
          question: "Encrypted poll",
          options: Array.isArray(message.meta?.poll?.options)
            ? message.meta.poll.options.map((option, index) => ({
                id: option.id,
                text: `Encrypted option ${index + 1}`,
              }))
            : [],
        },
      };
    } else if (
      ["image", "video", "audio", "document"].includes(message.messageType) &&
      message.decryptedContent
    ) {
      encryptedPayload = await encryptTextForConversation({
        plaintext: message.decryptedContent,
        currentUserId: userInfo?.id,
        userId: isTargetGroup ? undefined : participant._id || participant.id,
        groupId: isTargetGroup ? chat.group?._id : undefined,
        payloadType: "attachment-caption",
      });
    }

    if (
      ["image", "video", "audio", "document"].includes(message.messageType) &&
      message.mediaEncryption?.enabled
    ) {
      const decryptedMedia = await decryptMediaAttachmentToObjectUrl({
        message,
        currentUserId: userInfo?.id,
      });
      const mediaResponse = await fetch(decryptedMedia.objectUrl);
      const mediaBlob = await mediaResponse.blob();
      const decryptedFile = new File(
        [mediaBlob],
        decryptedMedia.fileName || "attachment",
        { type: decryptedMedia.mimeType || "application/octet-stream" }
      );
      const encryptedMediaUpload = await encryptMediaFileForConversation({
        file: decryptedFile,
        currentUserId: userInfo?.id,
        userId: isTargetGroup ? undefined : participant._id || participant.id,
        groupId: isTargetGroup ? chat.group?._id : undefined,
      });
      const uploadedMedia = await uploadFile(encryptedMediaUpload.encryptedFile, {
        encryptedMedia: true,
        originalMimeType: decryptedFile.type,
      });
      forwardedFileUrl = uploadedMedia?.fileUrl;
      forwardedStorageProvider = uploadedMedia?.storageProvider;
      forwardedStoragePath = uploadedMedia?.storagePath;
      forwardedStorageBucket = uploadedMedia?.storageBucket;
      forwardedMediaEncryption = encryptedMediaUpload.mediaEncryption;
    }

    return {
      recipient: isTargetGroup ? undefined : participant._id || participant.id,
      groupId: isTargetGroup ? chat.group?._id : undefined,
      content: encryptedPayload ? "" : message.content,
      messageType: message.messageType,
      fileUrl: forwardedFileUrl,
      storageProvider: forwardedStorageProvider,
      storagePath: forwardedStoragePath,
      storageBucket: forwardedStorageBucket,
      meta: forwardedMeta,
      replyTo: message.replyTo?._id || message.replyTo || null,
      forwardedFromMessageId: message._id || message.id,
      isForwarded: true,
      encryption: encryptedPayload?.encryption || null,
      mediaEncryption: forwardedMediaEncryption,
      timestamp: new Date().toISOString(),
    };
  };

  const handleToggleReaction = (message, emoji, isMine = false) =>
    new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error("Socket unavailable"));
        return;
      }

      socket.emit(
        isMine ? "remove_reaction" : "react_message",
        {
          messageId: message._id || message.id,
          emoji,
        },
        (ack) => {
          if (!ack?.ok) {
            toast.error(ack?.error || "Unable to update reaction.");
            reject(new Error(ack?.error || "Unable to update reaction."));
            return;
          }

          resolve(ack.message);
        }
      );
    });

  const handleToggleStar = (messageId) =>
    new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error("Socket unavailable"));
        return;
      }

      socket.emit("star_message", { messageId }, async (ack) => {
        if (!ack?.ok) {
          toast.error(ack?.error || "Unable to update starred message.");
          reject(new Error(ack?.error || "Unable to update starred message."));
          return;
        }

        await fetchStarredMessages();
        resolve(ack);
      });
    });

  const handleTogglePin = (messageId) =>
    new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error("Socket unavailable"));
        return;
      }

      socket.emit("pin_message", { messageId }, (ack) => {
        if (!ack?.ok) {
          toast.error(ack?.error || "Unable to pin message.");
          reject(new Error(ack?.error || "Unable to pin message."));
          return;
        }

        resolve(ack.message);
      });
    });

  const handleDeleteMessage = (messageId, scope = "me") =>
    new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error("Socket unavailable"));
        return;
      }

      socket.emit("delete_message", { messageId, scope }, (ack) => {
        if (!ack?.ok) {
          toast.error(ack?.error || "Unable to delete message.");
          reject(new Error(ack?.error || "Unable to delete message."));
          return;
        }

        resolve(ack);
      });
    });

  const handleEditMessage = (messageId, content, encryption = null) =>
    new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error("Socket unavailable"));
        return;
      }

      socket.emit("edit_message", { messageId, content, encryption }, (ack) => {
        if (!ack?.ok) {
          toast.error(ack?.error || "Unable to edit message.");
          reject(new Error(ack?.error || "Unable to edit message."));
          return;
        }

        resolve(ack.message);
      });
    });

  const stopActiveRecordingStream = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  const startAudioRecording = async () => {
    try {
      if (attachedFile.file) {
        clearAttachedFile();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMimeType =
        [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4",
        ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
      const mediaRecorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setRecordingSeconds(0);
      setIsRecordingAudio(true);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });

        if (audioBlob.size > 0) {
          const extension = audioBlob.type.includes("ogg")
            ? "ogg"
            : audioBlob.type.includes("mp4")
              ? "m4a"
              : "webm";
          const audioFile = new File(
            [audioBlob],
            `voice-note-${Date.now()}.${extension}`,
            { type: audioBlob.type || "audio/webm" }
          );

          setAttachedFile({ file: audioFile, type: audioFile.type });
        }

        stopActiveRecordingStream();
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setIsRecordingAudio(false);
        setRecordingSeconds(0);
      };

      mediaRecorder.start();
    } catch (error) {
      console.error("Error starting audio recording:", error);
      toast.error("Microphone access is required to record audio.");
      stopActiveRecordingStream();
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      setIsRecordingAudio(false);
      setRecordingSeconds(0);
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const initiateCall = async (callType = "video") => {
    const targetUserId = selectedChatId || activeCallUser?.userId;

    if (isDirectCallBusy(callState)) {
      toast.error("Finish the current call before starting another one.");
      return;
    }

    if (!targetUserId) {
      toast.error("Unable to resolve this contact for calling.");
      return;
    }

    apiClient
      .post(
        CALLS_LOG_ROUTE,
        { recipientId: targetUserId, type: callType, status: "initiated" },
        { withCredentials: true }
      )
      .catch((error) => console.error("Error logging call:", error));
    const { callToOtherUser } = await import("@/utils/webRTC/webRTCHandler");
    callToOtherUser(
      {
        userId: targetUserId,
        socketId: activeCallUser?.socketId,
        username: activeCallUser?.username,
        displayName: activeCallUser?.displayName,
        email: activeCallUser?.email,
      },
      callType
    );
  };

  const openGroupCallPicker = (callType = "audio") => {
    setGroupCallMode(callType);
    setShowGroupCallPicker(true);
  };

  const startGroupMemberCall = async (participantIds = []) => {
    if (isDirectCallBusy(callState)) {
      toast.error("Finish the current call before starting another one.");
      return;
    }

    if (!participantIds.length) {
      toast.error("Select at least one online member to start a group call.");
      return;
    }

    const { startGroupCall } = await import("@/utils/webRTC/webRTCGroupCallHandler");
    await startGroupCall({
      groupId: selectedChatId,
      groupName: selectedChatData?.name,
      participantIds,
      callType: groupCallMode,
    });
    setShowGroupCallPicker(false);
  };

  const openScheduleModal = (occasion = "general") => {
    if (!selectedChatData) return;

    setScheduleOccasionType(occasion);
    setShowAttachmentMenu(false);
    setShowScheduleModal(true);
  };

  const openSummaryModal = async () => {
    if (!aiEnabled) {
      toast.error("Enable AI Assist in Settings first.");
      return;
    }

    if (!isPremiumUser) {
      toast.error("Upgrade to Premium to summarize chats.");
      openPremiumModal();
      return;
    }

    setSummaryModal({ isOpen: true, loading: true, value: "" });

    try {
      const response = await apiClient.post(
        AI_SUMMARIZE_ROUTE,
        { conversationKey: selectedConversationKey },
        { withCredentials: true }
      );
      syncSubscriptionStateFromAI(response.data.subscription);

      const summaryText = [response.data.summary, ...(response.data.bullets || []).map((item) => `• ${item}`)]
        .filter(Boolean)
        .join("\n\n");

      setSummaryModal({
        isOpen: true,
        loading: false,
        value: summaryText,
      });
    } catch (error) {
      console.error("Error summarizing conversation:", error);
      toast.error(error.response?.data?.message || "Unable to summarize this chat.");
      setSummaryModal({ isOpen: false, loading: false, value: "" });
    }
  };

  const runAIMessageAction = async ({ route, payload, title, subtitle }) => {
    if (!aiEnabled) {
      toast.error("Enable AI Assist in Settings first.");
      return;
    }

    if (!isPremiumUser) {
      toast.error("Upgrade to Premium to use AI messaging.");
      openPremiumModal();
      return;
    }

    setAiAssistModal({
      isOpen: true,
      loading: true,
      title,
      subtitle,
      value: "",
    });

    try {
      const response = await apiClient.post(route, payload, { withCredentials: true });
      syncSubscriptionStateFromAI(response.data.subscription);
      setAiAssistModal({
        isOpen: true,
        loading: false,
        title,
        subtitle,
        value: response.data.text || "",
      });
    } catch (error) {
      console.error("Error running AI action:", error);
      toast.error(error.response?.data?.message || "AI action failed.");
      setAiAssistModal((currentState) => ({ ...currentState, isOpen: false, loading: false }));
    }
  };

  const handleCreatePoll = async ({ question, options, allowMultipleAnswers }) => {
    if (!socket || !selectedChatData) return;

    try {
      const encryptedPollPayload = await buildEncryptedPayload(
        JSON.stringify({
          question,
          options: options.map((option) => ({ text: option.text })),
        }),
        { payloadType: "poll" }
      );
      const pollRequestId =
        globalThis.crypto?.randomUUID?.() ||
        `poll-${Date.now()}-${Math.random()}`;

      socket.emit(
        "send_message",
        {
          clientMessageId: pollRequestId,
          clientTempId: pollRequestId,
          requestId: pollRequestId,
          recipient: isGroupChat ? undefined : selectedChatData._id,
          groupId: isGroupChat ? selectedChatData._id : undefined,
          content: "Encrypted poll",
          messageType: "poll",
          meta: {
            poll: {
              question: "Encrypted poll",
              options: options.map((option, index) => ({
                id: option.id,
                text: `Encrypted option ${index + 1}`,
              })),
              allowMultipleAnswers,
            },
          },
          encryption: encryptedPollPayload?.encryption || null,
          timestamp: new Date().toISOString(),
        },
        (ack) => {
          if (!ack?.ok) {
            toast.error(ack?.error || "Failed to create poll.");
          } else {
            toast.success("Poll created.");
          }
        }
      );
    } catch (error) {
      console.error("Unable to encrypt poll:", error);
      toast.error("Unable to create poll.");
    }
  };

  const handleVotePoll = (message, optionIds) =>
    new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error("Socket unavailable"));
        return;
      }

      socket.emit(
        "vote_poll",
        {
          messageId: message._id || message.id,
          optionIds,
        },
        (ack) => {
          if (!ack?.ok) {
            toast.error(ack?.error || "Unable to save vote.");
            reject(new Error(ack?.error || "Unable to save vote."));
            return;
          }

          resolve(ack.message);
        }
      );
    });

  const handleSendMessage = async () => {
    if (
      !canSend ||
      isSendingMessage ||
      sendingMessageRef.current ||
      (!isGroupChat && (isUserBlocked() || !canMessageDirectUser)) ||
      !socket ||
      !selectedChatData
    )
      return;

    let optimisticMessageId = null;
    let clientMessageId = null;
    let requestId = null;
    let shouldRetryAfterKeyInit = false;
    let retryConversationKey = resolvedConversationKey;

    try {
      sendingMessageRef.current = true;
      setIsSendingMessage(true);
      clientMessageId =
        globalThis.crypto?.randomUUID?.() ||
        `msg-${Date.now()}-${Math.random()}`;
      requestId = clientMessageId;

      if (editingMessageId) {
        const encryptedEditPayload = await buildEncryptedPayload(text.trim());
        await handleEditMessage(
          editingMessageId,
          encryptedEditPayload.content,
          encryptedEditPayload.encryption
        );
        setText("");
        clearReplyState();
        return;
      }

      let messageType = "text";
      let uploadedFile = null;
      let encryptedTextPayload = null;
      let encryptedMediaPayload = null;
      let preparedAttachmentFile = attachedFile.file;
      const pendingText = text;
      const pendingReplyId = replyingToMessage?._id || replyingToMessage?.id || null;
      const activeConversationKey =
        resolvedConversationKey ||
        (isGroupChat
          ? `group:${selectedChatId}`
          : getDirectConversationKey(userInfo?.id, selectedChatId));
      retryConversationKey = activeConversationKey;
      const optimisticContent =
        pendingText ||
        (attachedFile.file
          ? messageType === "image"
            ? "Image"
            : messageType === "video"
              ? "Video"
              : messageType === "audio"
                ? "Audio"
                : "Document"
          : "");

      optimisticMessageId = `temp:${clientMessageId}`;
      const optimisticPreviewMessage = {
        _id: optimisticMessageId,
        id: optimisticMessageId,
        clientMessageId,
        clientTempId: clientMessageId,
        requestId,
        conversationKey: activeConversationKey,
        sender: {
          _id: userInfo?.id,
          id: userInfo?.id,
          firstName: userInfo?.firstName,
          lastName: userInfo?.lastName,
          email: userInfo?.email,
          image: userInfo?.image,
        },
        recipient: isGroupChat ? undefined : selectedChatId,
        group: isGroupChat ? selectedChatData?._id : undefined,
        content: optimisticContent,
        decryptedContent: pendingText || "",
        messageType: attachedFile.file ? normalizeAttachmentKind(attachedFile.type, attachedFile.file.type) : "text",
        timestamp: new Date().toISOString(),
        status: "sending",
        replyTo: pendingReplyId,
        uploadStatus: attachedFile.file ? "preparing" : "sending",
      };

      mergeConversationMessageSet(activeConversationKey, optimisticPreviewMessage);

      if (attachedFile.file) {
        preparedAttachmentFile = await compressImageIfNeeded(attachedFile.file);
        messageType = normalizeAttachmentKind(attachedFile.type, preparedAttachmentFile.type);
        const previewUrl = URL.createObjectURL(preparedAttachmentFile);
        patchLocalMessage(activeConversationKey, { clientMessageId }, {
          messageType,
          content:
            messageType === "audio" && preparedAttachmentFile?.name?.startsWith("voice-note-")
              ? "Voice note"
              : pendingText || (messageType === "image"
                  ? "Image"
                  : messageType === "video"
                    ? "Video"
                    : messageType === "audio"
                      ? "Audio"
                      : "Document"),
          fileUrl: previewUrl,
          localPreviewUrl: previewUrl,
          uploadStatus: "uploading",
          uploadProgress: 0,
        });
        encryptedMediaPayload = await encryptMediaFileForConversation({
          file: preparedAttachmentFile,
          currentUserId: userInfo?.id,
          userId: isGroupChat ? undefined : selectedChatId,
          groupId: isGroupChat ? selectedChatId : undefined,
        });
        uploadedFile = await uploadFile(encryptedMediaPayload.encryptedFile, {
          encryptedMedia: true,
          originalMimeType: preparedAttachmentFile.type,
          onProgress: (progress) => {
            if (optimisticMessageId) {
              patchLocalMessage(activeConversationKey, { clientMessageId }, { uploadProgress: progress });
            }
          },
        });
        if (optimisticMessageId) {
          patchLocalMessage(activeConversationKey, { clientMessageId }, {
            uploadStatus: "processing",
            uploadProgress: 100,
          });
        }
        if (text.trim()) {
          encryptedTextPayload = await buildEncryptedPayload(text, {
            payloadType: "attachment-caption",
            preserveWhitespace: true,
          });
        }
      } else {
        encryptedTextPayload = await buildEncryptedPayload(text.trim());
      }

      const contentMap = {
        image: "Image",
        video: "Video",
        document: "Document",
        audio: attachedFile.file?.name?.startsWith("voice-note-")
          ? "Voice note"
          : "Audio",
      };

      socket.emit(
        "send_message",
        {
          clientMessageId,
          clientTempId: clientMessageId,
          requestId,
          recipient: isGroupChat ? undefined : selectedChatId,
          groupId: isGroupChat ? selectedChatId : undefined,
          content:
            messageType === "text"
              ? encryptedTextPayload?.content || ""
              : contentMap[messageType],
          messageType,
          fileUrl: uploadedFile?.fileUrl,
          storageProvider: uploadedFile?.storageProvider,
          storagePath: uploadedFile?.storagePath,
          storageBucket: uploadedFile?.storageBucket,
          replyTo: replyingToMessage?._id || replyingToMessage?.id || null,
          encryption:
            messageType === "text" || encryptedTextPayload?.encryption
              ? encryptedTextPayload?.encryption || null
              : null,
          mediaEncryption: encryptedMediaPayload?.mediaEncryption || null,
          timestamp: new Date().toISOString(),
        },
        (ack) => {
          if (!ack?.ok) {
            if (optimisticMessageId) {
              patchLocalMessage(activeConversationKey, { clientMessageId }, {
                uploadStatus: "failed",
                status: "failed",
                uploadError: ack?.error || "Failed to send",
              });
            }
            toast.error(ack?.error || "Failed to send message.");
            return;
          }
      if (optimisticMessageId && ack?.message) {
            const resolvedDisplayContent =
              pendingText ||
              (messageType === "image"
                ? "Image"
                : messageType === "video"
                  ? "Video"
                  : messageType === "audio"
                    ? "Audio"
                    : messageType === "document"
                      ? "Document"
                      : optimisticContent);
            mergeConversationMessageSet(activeConversationKey, {
              ...ack.message,
              clientMessageId,
              clientTempId: clientMessageId,
              requestId,
              content:
                ack.message.content ||
                (ack.message.encryption?.enabled ? resolvedDisplayContent : ""),
              decryptedContent:
                ack.message.decryptedContent ||
                (ack.message.encryption?.enabled ? resolvedDisplayContent : pendingText || ""),
              conversationKey:
                ack.message.conversationKey || activeConversationKey,
              status: ack.message.status || "sent",
              uploadStatus: null,
              uploadError: null,
              uploadProgress: 100,
            });
          }
        }
      );

      setText("");
      clearAttachedFile();
      clearReplyState();
      setShowAttachmentMenu(false);
    } catch (error) {
      if (typeof optimisticMessageId !== "undefined" && optimisticMessageId) {
        patchLocalMessage(retryConversationKey, { clientMessageId }, {
          uploadStatus: "failed",
          status: "failed",
          uploadError: error?.message || "Failed to send",
        });
      }
      if (
        error?.code === "GROUP_E2EE_NO_READY_RECIPIENTS" ||
        error?.code === "GROUP_E2EE_MISSING_MEMBERS" ||
        error?.code === "DIRECT_E2EE_MISSING_RECIPIENT" ||
        error?.message?.includes?.("Some group members have not enabled encrypted messaging yet.")
      ) {
        const missingRecipientIds = error?.missingRecipientIds || [];
        const initialized = await waitForConversationKeys(missingRecipientIds);

        if (initialized) {
          removeLocalMessage(retryConversationKey, {
            clientMessageId,
          });
          shouldRetryAfterKeyInit = true;
        }
      }

      if (!shouldRetryAfterKeyInit) {
        console.error("Unable to encrypt/send message:", error);
      }
      if (
        !shouldRetryAfterKeyInit &&
        (
          error?.code === "GROUP_E2EE_MISSING_MEMBERS" ||
          error?.code === "GROUP_E2EE_NO_READY_RECIPIENTS"
        )
      ) {
        toast.error(
          "Some group members have not initialized encrypted messaging yet. ConnectNow is waiting for them to come online and create keys."
        );
      } else if (!shouldRetryAfterKeyInit && error?.code === "DIRECT_E2EE_MISSING_RECIPIENT") {
        toast.error(
          "This contact has not initialized encrypted messaging yet. If they are online, ConnectNow is trying to prepare it now."
        );
      } else if (!shouldRetryAfterKeyInit) {
        toast.error("Unable to send message.");
      }
    } finally {
        setIsSendingMessage(false);
        sendingMessageRef.current = false;
      }

      if (shouldRetryAfterKeyInit) {
        queueMicrotask(() => {
          handleSendMessage();
        });
      }
  };

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");

    return `${mins}:${secs}`;
  };

  const renderAttachmentPreview = () => {
    if (!attachedFile.file || !attachmentPreviewUrl) return null;

    const attachmentKind = normalizeAttachmentKind(
      attachedFile.type,
      attachedFile.file.type
    );

    if (attachmentKind === "image") {
      return (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg font-semibold">{attachedFile.file.name}</p>
          <img
            src={attachmentPreviewUrl}
            alt={attachedFile.file.name}
            className="max-h-[280px] w-auto rounded-[28px] object-cover shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
          />
        </div>
      );
    }

    if (attachmentKind === "video") {
      return (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg font-semibold">{attachedFile.file.name}</p>
          <video
            controls
            src={attachmentPreviewUrl}
            className="max-h-[320px] w-full max-w-[520px] rounded-[28px] object-cover shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
          />
        </div>
      );
    }

    if (attachmentKind === "audio") {
      return (
        <div className="w-full max-w-[520px]">
          <AudioMessageCard
            fileUrl={attachmentPreviewUrl}
            isVoiceNote={attachedFile.file.name.startsWith("voice-note-")}
          />
        </div>
      );
    }

    return (
      <div className="flex w-full max-w-[520px] flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-2xl font-semibold">{attachedFile.file.name}</p>
          <p className="themed-subtitle mt-1 text-sm">
            {(attachedFile.file.type || "Document").toUpperCase()}
          </p>
        </div>
        {attachedFile.file.type === "application/pdf" ? (
          <iframe
            src={attachmentPreviewUrl}
            title={attachedFile.file.name}
            className="h-[420px] w-full rounded-[28px] border border-white/10 bg-white"
          />
        ) : (
          <div className="themed-file-card flex w-full items-center gap-4 rounded-[28px] p-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500 text-base font-bold text-white">
              DOC
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{attachedFile.file.name}</p>
              <p className="text-sm opacity-70">
                {(attachedFile.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const filteredMessages = useMemo(() => {
    const messages = Array.isArray(selectedChatMessages)
      ? selectedChatMessages
      : [];

    if (!resolvedConversationKey) return [];
    return mergeMessages(
      [],
      messages
        .map((message) =>
          normalizeMessage(message, { conversationKey: resolvedConversationKey })
        )
        .filter(
          (message) => message && message.conversationKey === resolvedConversationKey
        )
    );
  }, [resolvedConversationKey, selectedChatMessages]);

  const pinnedMessages = useMemo(
    () =>
      filteredMessages.filter((message) =>
        (message.pinnedByChat || []).some(
          (pin) => pin.conversationKey === selectedConversationKey
        )
      ),
    [filteredMessages, selectedConversationKey]
  );
  const starredMessageIdSet = useMemo(
    () => new Set(starredMessages.map((message) => String(message._id || message.id))),
    [starredMessages]
  );

  const renderMessageRow = (message) => {
    const senderId =
      typeof message.sender === "string"
        ? message.sender
        : message.sender?._id || message.sender?.id;
    const isSender = senderId === userInfo.id;

    return (
      <div
        className={`flex ${isSender ? "justify-end" : "justify-start"} py-1`}
        data-testid={`chat-message-row-${String(message._id || message.id)}`}
      >
        <div
          data-message-id={String(message._id || message.id)}
          className={`flex ${isMobile ? "max-w-[86%]" : "max-w-[72%]"} min-w-0 items-end gap-3 ${
            isSender ? "flex-row-reverse" : ""
          } ${focusedMessageId === String(message._id || message.id) ? "rounded-[28px] ring-2 ring-cyan-300/70 ring-offset-4 ring-offset-transparent" : ""}`}
        >
          {!isSender && (
            <div className="themed-received-avatar flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold">
              {(selectedChatData?.firstName || "R")[0]}
            </div>
          )}

          <div className="min-w-0 max-w-full">
            {isGroupChat && !isSender && message.messageType !== "system" && (
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-200/80">
                {typeof message.sender === "string"
                  ? "Member"
                  : [message.sender?.firstName, message.sender?.lastName]
                      .filter(Boolean)
                      .join(" ") || message.sender?.email || "Member"}
              </p>
            )}
            {message.isForwarded && (
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                Forwarded
              </p>
            )}
            <div className="flex items-start gap-2">
              {message.messageType === "poll" ? (
                <div className="min-w-0">{renderMessageBody(message)}</div>
              ) : (
                <div
                  className={`min-w-0 max-w-full overflow-hidden rounded-[22px] ${
                    ["image", "video"].includes(String(message.messageType || "").toLowerCase())
                      ? "p-2"
                      : "px-4 py-3"
                  } shadow-[0_12px_30px_rgba(0,0,0,0.2)] ${
                    isSender
                      ? "rounded-br-md bg-gradient-to-r from-[#ef5da8] to-[#ff9f43] text-white"
                      : "themed-received-bubble rounded-bl-md"
                  }`}
                >
                  {message.replyPreview && (
                    <button
                      type="button"
                      className={`mb-3 block w-full rounded-2xl border px-3 py-2 text-left ${
                        isSender
                          ? "border-white/20 bg-white/10"
                          : "border-white/10 bg-black/5"
                      }`}
                      onClick={() => setFocusedMessageId(String(message.replyPreview.messageId))}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">
                        Reply
                      </p>
                      <p className="mt-1 truncate text-sm">{message.replyPreview.content}</p>
                    </button>
                  )}
                  {renderMessageBody(message)}
                  {message.editedAt && <p className="mt-2 text-[11px] opacity-70">edited</p>}
                </div>
              )}

              {message.messageType !== "system" && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    className="themed-panel-soft flex h-8 w-8 items-center justify-center rounded-full opacity-80 transition hover:opacity-100"
                    onClick={(event) => {
                      const messageId = String(message._id || message.id);
                      if (activeMessageMenuId === messageId) {
                        setActiveMessageMenuId(null);
                        return;
                      }

                      const rect = event.currentTarget.getBoundingClientRect();
                      const menuWidth = 224;
                      const menuHeight = 424;
                      const viewportPadding = 12;
                      const fitsBelow =
                        rect.bottom + 8 + menuHeight <= window.innerHeight - viewportPadding;
                      const preferRightAligned = isSender;
                      const left = preferRightAligned
                        ? Math.max(
                            viewportPadding,
                            Math.min(
                              rect.right - menuWidth,
                              window.innerWidth - menuWidth - viewportPadding
                            )
                          )
                        : Math.max(
                            viewportPadding,
                            Math.min(
                              rect.left,
                              window.innerWidth - menuWidth - viewportPadding
                            )
                          );

                      setActiveMessageMenuPosition({
                        top: fitsBelow
                          ? rect.bottom + 8
                          : Math.max(viewportPadding, rect.top - menuHeight - 8),
                        left,
                      });
                      setActiveMessageMenuId(messageId);
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>

                  {activeMessageMenuId === String(message._id || message.id) &&
                    createPortal(
                      <>
                        <div
                          className="fixed inset-0 z-[95]"
                          onClick={() => setActiveMessageMenuId(null)}
                        />
                        <div
                          className="themed-modal-surface fixed z-[100] w-56 rounded-[20px] p-2 shadow-[0_24px_70px_rgba(2,8,23,0.32)]"
                          style={{
                            top: activeMessageMenuPosition.top,
                            left: activeMessageMenuPosition.left,
                          }}
                        >
                          <div className="mb-2 flex flex-wrap gap-2 px-2 pt-2">
                            {QUICK_REACTIONS.map((emoji) => {
                              const isMine = (message.reactions || []).some(
                                (reaction) =>
                                  String(reaction.userId?._id || reaction.userId) ===
                                    String(userInfo.id) && reaction.emoji === emoji
                              );

                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  className={`rounded-full px-2 py-1 text-lg transition ${
                                    isMine ? "bg-cyan-400/15" : "bg-white/5"
                                  }`}
                                  onClick={() => {
                                    handleToggleReaction(message, emoji, isMine);
                                    setActiveMessageMenuId(null);
                                  }}
                                >
                                  {emoji}
                                </button>
                              );
                            })}
                          </div>
                          <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5" onClick={() => { setReplyingToMessage(message); setEditingMessageId(null); setText(""); setActiveMessageMenuId(null); }}>
                            <ChevronDown className="h-4 w-4 rotate-90" />
                            Reply
                          </button>
                          <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5" onClick={() => { setForwardingMessage(message); setShowForwardModal(true); setActiveMessageMenuId(null); }}>
                            <Forward className="h-4 w-4" />
                            Forward
                          </button>
                          <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5" onClick={() => { handleToggleStar(message._id || message.id); setActiveMessageMenuId(null); }}>
                            <Star className="h-4 w-4" />
                            {starredMessageIdSet.has(String(message._id || message.id)) ? "Unstar" : "Star"}
                          </button>
                          <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5" onClick={() => { handleTogglePin(message._id || message.id); setActiveMessageMenuId(null); }}>
                            <Pin className="h-4 w-4" />
                            {(message.pinnedByChat || []).some((pin) => pin.conversationKey === selectedConversationKey) ? "Unpin" : "Pin"}
                          </button>
                          {message.messageType === "text" && !message.isDeletedForEveryone && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5"
                              onClick={() => {
                                if (!isPremiumUser) {
                                  openPremiumModal();
                                } else {
                                  runAIMessageAction({
                                    route: AI_TRANSLATE_ROUTE,
                                    payload: {
                                      text: message.content,
                                      targetLanguage:
                                        userInfo?.aiPreferences?.translationLanguage || "English",
                                    },
                                    title: "Translate message",
                                    subtitle: `Translated to ${userInfo?.aiPreferences?.translationLanguage || "English"}`,
                                  });
                                }
                                setActiveMessageMenuId(null);
                              }}
                            >
                              {isPremiumUser ? (
                                <Sparkles className="h-4 w-4" />
                              ) : (
                                <Lock className="h-4 w-4" />
                              )}
                              Translate
                            </button>
                          )}
                          {message.messageType === "text" && !message.isDeletedForEveryone && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5"
                              onClick={() => {
                                if (!isPremiumUser) {
                                  openPremiumModal();
                                } else {
                                  runAIMessageAction({
                                    route: AI_REWRITE_ROUTE,
                                    payload: {
                                      text: message.content,
                                      tone: userInfo?.aiPreferences?.preferredTone || "friendly",
                                    },
                                    title: "Rewrite message",
                                    subtitle: `Rewritten in a ${userInfo?.aiPreferences?.preferredTone || "friendly"} tone`,
                                  });
                                }
                                setActiveMessageMenuId(null);
                              }}
                            >
                              {isPremiumUser ? (
                                <Wand2 className="h-4 w-4" />
                              ) : (
                                <Lock className="h-4 w-4" />
                              )}
                              Rewrite tone
                            </button>
                          )}
                          {isSender && message.messageType === "text" && !message.isDeletedForEveryone && (
                            <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5" onClick={() => { setEditingMessageId(String(message._id || message.id)); setReplyingToMessage(null); setText(message.content || ""); setActiveMessageMenuId(null); }}>
                              <PenSquare className="h-4 w-4" />
                              Edit
                            </button>
                          )}
                          <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5" onClick={() => { handleDeleteMessage(message._id || message.id, "me"); setActiveMessageMenuId(null); }}>
                            <Trash2 className="h-4 w-4" />
                            Delete for me
                          </button>
                          {isSender && (
                            <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10" onClick={() => { handleDeleteMessage(message._id || message.id, "everyone"); setActiveMessageMenuId(null); }}>
                              <Trash2 className="h-4 w-4" />
                              Delete for everyone
                            </button>
                          )}
                        </div>
                      </>,
                      document.body
                    )}
                </div>
              )}
            </div>
            {message.messageType !== "system" && (
              <ReactionSummary
                reactions={message.reactions || []}
                currentUserId={userInfo.id}
                onToggleReaction={(emoji, isMine) =>
                  handleToggleReaction(message, emoji, isMine)
                }
              />
            )}
            <div
              className={`mt-2 flex items-center gap-1 text-[11px] text-slate-500 ${
                isSender ? "justify-end" : "justify-start"
              }`}
            >
              <span>{moment(message.timestamp).format("LT")}</span>
              {isSender && renderStatusTick(message)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMessageBody = (message) => {
    const attachmentCaption = String(message.decryptedContent || "").trim();
    const isAwaitingDecryption =
      Boolean(message?.encryption?.enabled) &&
      (message?.decryptionPending ||
        (!message?.decryptionError &&
          !String(message?.decryptedContent || message?.content || "").trim()));
    const hasDecryptionFailure =
      Boolean(message?.encryption?.enabled) &&
      Boolean(message?.decryptionError) &&
      !message?.decryptionPending;
    const fallbackLabel =
      message.messageType === "audio"
        ? "Audio unavailable"
        : message.messageType === "video"
          ? "Video unavailable"
          : message.messageType === "image"
            ? "Image unavailable"
            : message.messageType === "document"
              ? "Document unavailable"
            : "Message unavailable";
    const decryptionFailureLabel =
      String(message?.decryptionFailureLabel || "").trim() ||
      "Unable to decrypt this message on this device.";

    if (message.messageType === "system") {
      return (
        <div className="mx-auto rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-center text-sm text-slate-300">
          {message.content}
        </div>
      );
    }

    if (message.messageType === "text") {
      const displayText =
        String(message.decryptedContent || message.content || "").trim();
      if (isAwaitingDecryption) {
        return (
          <div className="space-y-2">
            <div className="h-3.5 w-32 animate-pulse rounded-full bg-white/10" />
            <div className="h-3.5 w-20 animate-pulse rounded-full bg-white/10" />
          </div>
        );
      }

      if (hasDecryptionFailure || !displayText) {
        return (
          <p className="text-sm italic text-slate-300/90">
            {hasDecryptionFailure ? decryptionFailureLabel : "Message unavailable"}
          </p>
        );
      }

      return (
        <p className="whitespace-pre-wrap break-words text-[15px]">
          {renderTextWithMentions(displayText)}
        </p>
      );
    }

    if (message.messageType === "poll") {
      return (
        <PollMessageCard
          message={message}
          currentUserId={userInfo.id}
          onVote={handleVotePoll}
        />
      );
    }

    if (!message.fileUrl || hasDecryptionFailure) {
      return (
        <div className="space-y-2">
          <p className="text-sm italic text-slate-300/90">
            {hasDecryptionFailure
              ? decryptionFailureLabel
              : fallbackLabel}
          </p>
          {attachmentCaption ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {renderTextWithMentions(attachmentCaption)}
            </p>
          ) : null}
        </div>
      );
    }

    if (message.mediaEncryption?.enabled) {
      return (
        <EncryptedMediaMessage
          message={message}
          currentUserId={userInfo.id}
          isMobile={isMobile}
          onOpenImage={(imageUrl) => {
            setSelectedImage(imageUrl);
            setIsModalOpen(true);
          }}
        />
      );
    }

    if (message.messageType === "image") {
      return (
        <div className={`${isMobile ? "max-w-[58vw]" : "max-w-[340px]"} w-full min-w-0 space-y-3`}>
          <img
            src={getSafeMediaUrl(message.fileUrl)}
            alt="Attachment"
            className={`${isMobile ? "max-h-[190px]" : "max-h-[260px]"} block h-auto w-full rounded-2xl object-cover`}
            onClick={() => {
              setSelectedImage(getSafeMediaUrl(message.fileUrl));
              setIsModalOpen(true);
            }}
          />
          {attachmentCaption ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {renderTextWithMentions(attachmentCaption)}
            </p>
          ) : null}
        </div>
      );
    }

    if (message.messageType === "video") {
      return (
        <div className={`${isMobile ? "max-w-[58vw]" : "max-w-[340px]"} w-full min-w-0 space-y-3`}>
          <video
            controls
            className={`${isMobile ? "max-h-[190px]" : "max-h-[260px]"} block h-auto w-full rounded-2xl object-cover`}
            src={getSafeMediaUrl(message.fileUrl)}
          />
          {attachmentCaption ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {renderTextWithMentions(attachmentCaption)}
            </p>
          ) : null}
          <p className="text-xs opacity-75">Video attachment</p>
        </div>
      );
    }

    if (message.messageType === "audio") {
      return (
        <div className="w-full min-w-0 space-y-3">
          <AudioMessageCard
            fileUrl={message.fileUrl}
            isVoiceNote={String(message.content || "").toLowerCase().includes("voice")}
          />
          {attachmentCaption ? (
            <p className="whitespace-pre-wrap break-words px-1 text-sm leading-6">
              {renderTextWithMentions(attachmentCaption)}
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <div className="w-full min-w-0 space-y-3">
        <DocumentMessageCard fileUrl={message.fileUrl} />
        {attachmentCaption ? (
          <p className="whitespace-pre-wrap break-words px-1 text-sm leading-6">
            {renderTextWithMentions(attachmentCaption)}
          </p>
        ) : null}
      </div>
    );
  };

  const renderStatusTick = (message) => {
    if (message.uploadStatus === "uploading") {
      return (
        <span className="text-[10px] text-cyan-300">
          {Number(message.uploadProgress || 0)}%
        </span>
      );
    }

    if (message.uploadStatus === "processing") {
      return <span className="text-[10px] text-cyan-300">Encrypting...</span>;
    }

    if (message.uploadStatus === "failed") {
      return <span className="text-[10px] text-rose-300">Failed</span>;
    }

    if (isGroupChat) {
      return null;
    }

    if (message.status === "seen") {
      return <Tick color="#67e8f9" read />;
    }

    if (message.status === "delivered") {
      return <Tick color="#94a3b8" read />;
    }

    return <Tick color="#64748b" read />;
  };

  const jumpToMessageAndCloseModal = (messageId) => {
    setFocusedMessageId(messageId);
    setShowStarredModal(false);
  };

  const retryLoadMessages = () => {
    if (!resolvedConversationKey) return;
    setMessageLoadError("");
    setConversationMessagesLoading(resolvedConversationKey, false);
    useAppStore.setState((state) => ({
      messagesLoadedByConversationKey: {
        ...state.messagesLoadedByConversationKey,
        [resolvedConversationKey]: false,
      },
    }));
  };

  const selectedChatTitle = isGroupChat
    ? selectedChatData?.name
    : [selectedChatData?.firstName, selectedChatData?.lastName]
        .filter(Boolean)
        .join(" ") || selectedChatData?.email;

  const selectedChatStatus = isGroupChat
    ? `${selectedChatData?.memberCount || selectedChatData?.members?.length || 0} members`
    : isSelectedUserOnline
      ? "Online"
      : "Offline";

  const birthdayChip =
    !isMobile && !isGroupChat && selectedBirthdayReminder ? (
      <button
        type="button"
        onClick={() => openScheduleModal("birthday")}
        className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-400/15"
      >
        <Gift className="h-3.5 w-3.5" />
        {selectedBirthdayReminder.daysUntilBirthday === 0
          ? "Birthday today"
          : `Birthday in ${selectedBirthdayReminder.daysUntilBirthday} day${
              selectedBirthdayReminder.daysUntilBirthday === 1 ? "" : "s"
            }`}
      </button>
    ) : null;

  const warningBanner =
    !isGroupChat && contactTrustState?.status === "changed" ? (
      <div className="border-b border-rose-400/15 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">
        This contact&apos;s security key has changed. Verify the new fingerprint before you share sensitive information.
      </div>
    ) : null;

  const decryptingBanner = isDecryptingMessages ? (
    <div className="border-b border-cyan-400/10 bg-cyan-400/6 px-4 py-2 text-xs text-cyan-100">
      Decrypting secure messages in the background...
    </div>
  ) : null;

  if (!userInfo) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Loading chat...
      </div>
    );
  }

  if (!selectedChatData) {
    return <EmptyChatState />;
  }

  return (
    <>
      <ChatView
        header={
          <ChatHeader
            isMobile={isMobile}
            onBack={onBack}
            avatarSrc={selectedChatData?.image || "/avatar.png"}
            title={selectedChatTitle}
            status={{
              label: selectedChatStatus,
              className: isSelectedUserOnline ? "text-cyan-300" : "text-slate-500",
            }}
            onOpenDetail={onToggleDetail}
            onPreviewAvatar={() => {
              setSelectedImage(selectedChatData?.image || "/avatar.png");
              setIsModalOpen(true);
            }}
            birthdayChip={birthdayChip}
            warningBanner={warningBanner}
            decryptingBanner={decryptingBanner}
            desktopActions={
              <>
                {!isGroupChat && (
                  <button
                    type="button"
                    data-testid="chat-verify-key-button"
                    className={`themed-panel-soft hidden h-10 items-center justify-center rounded-2xl px-3 text-xs transition hover:text-white md:inline-flex ${
                      contactTrustState?.status === "changed"
                        ? "border border-rose-400/25 text-rose-200"
                        : contactTrustState?.status === "verified"
                          ? "text-emerald-200"
                          : ""
                    }`}
                    onClick={
                      contactTrustState?.status === "verified"
                        ? handleClearFingerprintVerification
                        : handleVerifyCurrentFingerprint
                    }
                    title="Manage contact security verification"
                  >
                    {loadingContactTrustState
                      ? "Checking..."
                      : contactTrustState?.status === "verified"
                        ? "Verified"
                        : "Verify"}
                  </button>
                )}
                <button
                  type="button"
                  className="themed-panel-soft hidden h-10 w-10 items-center justify-center rounded-2xl transition hover:text-white md:flex"
                  onClick={() => openScheduleModal("general")}
                >
                  <CalendarClock className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={`themed-panel-soft hidden h-10 w-10 items-center justify-center rounded-2xl transition hover:text-white md:flex ${
                    !isPremiumUser ? "opacity-80" : ""
                  }`}
                  onClick={openSummaryModal}
                  title={
                    isPremiumUser
                      ? "Summarize chat"
                      : "Upgrade to Premium to unlock AI summaries"
                  }
                >
                  {isPremiumUser ? <Sparkles className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  className="themed-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl transition hover:text-white"
                  onClick={() =>
                    isGroupChat ? openGroupCallPicker("audio") : initiateCall("audio")
                  }
                  title={isGroupChat ? "Call a group member" : "Audio call"}
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="themed-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl transition hover:text-white"
                  onClick={() =>
                    isGroupChat ? openGroupCallPicker("video") : initiateCall("video")
                  }
                  title={isGroupChat ? "Video call a group member" : "Video call"}
                >
                  <Video className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="themed-panel-soft hidden h-10 w-10 items-center justify-center rounded-2xl transition hover:text-white md:flex"
                  onClick={onToggleSearch}
                >
                  <Search className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="themed-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl transition hover:text-white"
                  onClick={onToggleDetail}
                >
                  <Info className="h-4 w-4" />
                </button>
              </>
            }
            mobileActions={
              <>
                <button
                  type="button"
                  className="themed-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl transition hover:text-white"
                  onClick={() =>
                    isGroupChat ? openGroupCallPicker("audio") : initiateCall("audio")
                  }
                  title={isGroupChat ? "Call a group member" : "Audio call"}
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="themed-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl transition hover:text-white"
                  onClick={() =>
                    isGroupChat ? openGroupCallPicker("video") : initiateCall("video")
                  }
                  title={isGroupChat ? "Video call a group member" : "Video call"}
                >
                  <Video className="h-4 w-4" />
                </button>
                <div className="relative z-50">
                  <button
                    type="button"
                    className="themed-panel-soft flex h-11 w-11 items-center justify-center rounded-2xl transition hover:text-white"
                    onClick={() => setShowMobileHeaderMenu((prev) => !prev)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {showMobileHeaderMenu && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-[90] cursor-default"
                        onClick={() => setShowMobileHeaderMenu(false)}
                      />
                      <div className="themed-modal-surface absolute right-0 top-12 z-[100] w-56 rounded-[18px] border border-white/10 p-2 shadow-[0_24px_70px_rgba(2,8,23,0.32)]">
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5"
                          onClick={() => {
                            setShowMobileHeaderMenu(false);
                            onToggleSearch();
                          }}
                        >
                          <Search className="h-4 w-4" />
                          Search in chat
                        </button>
                        {!isGroupChat && (
                          <button
                            type="button"
                            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5 ${
                              contactTrustState?.status === "changed"
                                ? "text-rose-200"
                                : contactTrustState?.status === "verified"
                                  ? "text-emerald-200"
                                  : ""
                            }`}
                            onClick={() => {
                              setShowMobileHeaderMenu(false);
                              if (contactTrustState?.status === "verified") {
                                handleClearFingerprintVerification();
                                return;
                              }
                              handleVerifyCurrentFingerprint();
                            }}
                          >
                            {contactTrustState?.status === "verified" ? (
                              <ShieldCheck className="h-4 w-4" />
                            ) : contactTrustState?.status === "changed" ? (
                              <ShieldAlert className="h-4 w-4" />
                            ) : (
                              <ShieldQuestion className="h-4 w-4" />
                            )}
                            {contactTrustState?.status === "verified"
                              ? "Verified secure chat"
                              : "Verify security"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5"
                          onClick={() => {
                            setShowMobileHeaderMenu(false);
                            openScheduleModal("general");
                          }}
                        >
                          <CalendarClock className="h-4 w-4" />
                          Schedule message
                        </button>
                        <button
                          type="button"
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5 ${
                            !isPremiumUser ? "opacity-80" : ""
                          }`}
                          onClick={() => {
                            setShowMobileHeaderMenu(false);
                            openSummaryModal();
                          }}
                        >
                          {isPremiumUser ? (
                            <Sparkles className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                          AI summary
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5"
                          onClick={() => {
                            setShowMobileHeaderMenu(false);
                            onToggleDetail();
                          }}
                        >
                          <Info className="h-4 w-4" />
                          Chat info
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            }
          />
        }
        messageArea={
          <MessageList
            isMobile={isMobile}
            pinnedMessage={pinnedMessages[0] || null}
            onJumpToPinned={() =>
              setFocusedMessageId(String(pinnedMessages[0]?._id || pinnedMessages[0]?.id))
            }
            error={messageLoadError}
            loading={
              Boolean(messagesLoadingByConversationKey?.[resolvedConversationKey]) &&
              !filteredMessages.length
            }
            messages={filteredMessages}
            renderMessageRow={renderMessageRow}
            messageListRef={messageListRef}
            typingLabel={typingLabel}
            hasPendingNewMessages={hasPendingNewMessages}
            isAtMessageBottom={isAtMessageBottom}
            onJumpToLatest={() => {
              messageListRef.current?.scrollToBottom("smooth");
              setHasPendingNewMessages(false);
            }}
            onRetry={retryLoadMessages}
          />
        }
        composer={
          <MessageComposer composerRef={composerRef} isMobile={isMobile}>
          {(replyingToMessage || editingMessageId) && (
            <div className={`themed-file-card absolute ${isMobile ? "-top-24 right-0" : "-top-20 right-16"} left-0 flex items-start justify-between gap-4 rounded-2xl px-4 py-3`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {editingMessageId ? "Editing message" : "Replying to message"}
                </p>
                <p className="themed-subtitle mt-1 truncate text-sm">
                  {editingMessageId
                    ? text || "Update your message"
                    : replyingToMessage?.content ||
                      replyingToMessage?.replyPreview?.content ||
                      replyingToMessage?.meta?.poll?.question ||
                      "Attachment"}
                </p>
              </div>
              <button
                type="button"
                className="themed-panel-soft rounded-full p-2"
                onClick={() => {
                  clearReplyState();
                  setText("");
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {attachedFile.file && (
            <div className="themed-page-card absolute bottom-20 left-1/2 z-20 flex w-[min(680px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col items-center gap-5 rounded-[28px] p-4 shadow-[0_30px_90px_rgba(15,23,42,0.18)] md:w-[min(680px,calc(100vw-5rem))] md:rounded-[32px] md:p-6">
              <button
                type="button"
                className="themed-panel-soft absolute left-4 top-4 rounded-full p-2"
                onClick={clearAttachedFile}
              >
                <X className="themed-title h-4 w-4" />
              </button>
              {renderAttachmentPreview()}
            </div>
          )}

          <button
            type="button"
            className={`themed-composer-button flex items-center justify-center rounded-full transition ${isMobile ? "h-10 w-10" : "h-11 w-11"}`}
            onClick={() => setShowEmoji((prev) => !prev)}
          >
            <Smile className="h-5 w-5" />
          </button>

          <button
            type="button"
            data-testid="chat-attachment-menu-button"
            className={`themed-composer-button flex items-center justify-center rounded-full transition ${isMobile ? "h-10 w-10" : "h-11 w-11"} ${
              showAttachmentMenu ? "themed-composer-button-active" : ""
            }`}
            onClick={() => setShowAttachmentMenu((prev) => !prev)}
          >
            <ChevronDown
              className={`h-5 w-5 transition ${showAttachmentMenu ? "rotate-180" : ""}`}
            />
          </button>

          {showEmoji && (
            <div className={`absolute z-20 ${isMobile ? "bottom-14 left-0" : "bottom-16 left-0"}`}>
              <Suspense fallback={<RouteLoader message="Loading emoji picker..." />}>
                <EmojiPicker onEmojiClick={handleEmojiClick} />
              </Suspense>
            </div>
          )}

          {showAttachmentMenu && (
            <div className={`absolute z-20 ${isMobile ? "bottom-14 left-12" : "bottom-16 left-14"}`}>
              <AttachmentMenu
                onAttach={(file, type) => {
                  setAttachedFile({ file, type });
                  setShowAttachmentMenu(false);
                }}
                onCreatePoll={() => {
                  setShowAttachmentMenu(false);
                  setShowPollModal(true);
                }}
                onCreateSchedule={() => openScheduleModal("general")}
              />
            </div>
          )}

          {isRecordingAudio && (
            <div className={`themed-file-card absolute ${isMobile ? "-top-20 right-0" : "-top-16 right-16"} left-0 flex items-center justify-between rounded-2xl px-4 py-3`}>
              <div className="flex items-center gap-3">
                <div className="flex h-3 w-3 rounded-full bg-rose-500" />
                <p className="text-sm font-semibold">
                  Recording voice note {formatRecordingTime(recordingSeconds)}
                </p>
              </div>
              <button
                type="button"
                className="themed-action-danger rounded-full px-4 py-2 text-sm font-medium"
                onClick={stopAudioRecording}
              >
                Stop
              </button>
            </div>
          )}

          {aiEnabled && !attachedFile.file && !isRecordingAudio && !text.trim() && (
            <div className={`absolute ${isMobile ? "-top-24 right-0" : "-top-20 right-16"} left-0 flex flex-wrap gap-2`}>
              {!isPremiumUser ? (
                <button
                  type="button"
                  onClick={openPremiumModal}
                  className="themed-file-card flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Upgrade to Premium for smart replies
                </button>
              ) : loadingSmartReplies ? (
                <div className="themed-file-card rounded-full px-4 py-2 text-xs">
                  Generating smart replies...
                </div>
              ) : (
                smartReplies.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setText(suggestion)}
                    className="themed-file-card rounded-full px-4 py-2 text-sm transition hover:translate-y-[-1px]"
                  >
                    {suggestion}
                  </button>
                ))
              )}
            </div>
          )}

          {aiEnabled && isPremiumUser && text.trim() && !attachedFile.file && !isRecordingAudio && (
            <div className={`absolute ${isMobile ? "-top-28 right-0" : "-top-24 right-16"} left-0 flex flex-wrap items-center gap-2`}>
              {loadingAutocomplete ? (
                <div className="themed-file-card rounded-full px-4 py-2 text-xs">
                  Completing your draft...
                </div>
              ) : autocompleteSuggestion ? (
                <button
                  type="button"
                  onClick={() => setText(autocompleteSuggestion)}
                  className="themed-file-card flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm transition hover:translate-y-[-1px]"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Complete: {autocompleteSuggestion}
                  </span>
                  <span className="text-[11px] opacity-70">Tab</span>
                </button>
              ) : null}

              {loadingToneSuggestions ? (
                <div className="themed-file-card rounded-full px-4 py-2 text-xs">
                  Generating tone options...
                </div>
              ) : toneSuggestions ? (
                <>
                  {[
                    { key: "formal", label: "Formal" },
                    { key: "friendly", label: "Friendly" },
                    { key: "concise", label: "Concise" },
                  ].map((toneOption) =>
                    toneSuggestions?.[toneOption.key] ? (
                      <button
                        key={toneOption.key}
                        type="button"
                        onClick={() => setText(toneSuggestions[toneOption.key])}
                        className="themed-file-card rounded-full px-4 py-2 text-xs font-medium transition hover:translate-y-[-1px]"
                      >
                        {toneOption.label}
                      </button>
                    ) : null
                  )}
                </>
              ) : null}
            </div>
          )}

          {!isGroupChat && !canMessageDirectUser && (
            <div className={`themed-page-card absolute ${isMobile ? "-top-24 right-0" : "-top-20 right-16"} left-0 rounded-2xl px-4 py-3`}>
              <p className="themed-title text-sm font-medium">
                Send friend request to start chatting
              </p>
              <p className="themed-subtitle mt-1 text-xs">
                Messages are enabled only after the other user accepts your request.
              </p>
            </div>
          )}

          {hasGroupEncryptionWarning && (
            <div className={`themed-page-card absolute ${isMobile ? "-top-28 right-0" : "-top-20 right-16"} left-0 rounded-2xl px-4 py-3`}>
              <p className="themed-title text-sm font-medium">
                Some members still need encryption setup
              </p>
              <p className="themed-subtitle mt-1 text-xs">
                {groupE2eeBlockedMembers
                  .slice(0, 3)
                  .map((member) => member.displayName)
                  .join(", ")}
                {groupE2eeBlockedMembers.length > 3 ? " and others" : ""} need to open
                ConnectNow once to create their encryption keys.
              </p>
            </div>
          )}

          <Input
            data-testid="chat-composer-input"
            placeholder={
              !isGroupChat && isUserBlocked()
                ? "You cannot send messages to this user"
                : !isGroupChat && !canMessageDirectUser
                  ? "Send friend request to start chatting"
                : editingMessageId
                  ? "Edit your message..."
                  : "Type a message..."
            }
            value={text}
            onChange={handleComposerTextChange}
            onBlur={stopTypingNow}
            onKeyDown={(e) => {
              if (e.key === "Tab" && autocompleteSuggestion) {
                e.preventDefault();
                setText(autocompleteSuggestion);
                return;
              }

              if (e.key === "Enter") {
                e.preventDefault();
                stopTypingNow();
                if (isSendingMessage || sendingMessageRef.current) {
                  return;
                }
                handleSendMessage();
              }
            }}
            disabled={!isGroupChat && (isUserBlocked() || !canMessageDirectUser)}
            className={`themed-input ${
              isMobile ? "h-12 px-5 text-base leading-6" : "h-[52px] px-6"
            } rounded-full`}
          />

          {aiEnabled && !isPremiumUser && !isMobile && (
            <button
              type="button"
              onClick={openPremiumModal}
              className="themed-action-info absolute -top-16 right-16 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium"
            >
              <Crown className="h-3.5 w-3.5" />
              Upgrade AI ({aiRemaining}/day)
            </button>
          )}

          <button
            type="button"
            onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
            className={`flex shrink-0 items-center justify-center rounded-full transition ${isMobile ? "h-11 w-11" : "h-12 w-12"} ${
              isRecordingAudio
                ? "themed-action-danger"
                : "themed-composer-button"
            }`}
            disabled={!isGroupChat && (isUserBlocked() || !canMessageDirectUser)}
          >
            <Mic className="h-4 w-4" />
          </button>

          <button
            type="button"
            data-testid="chat-send-button"
            onClick={() => {
              stopTypingNow();
              handleSendMessage();
            }}
            className={`flex items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#22d3ee] text-white shadow-[0_18px_40px_rgba(34,211,238,0.2)] transition hover:scale-[1.02] ${
              isMobile ? "h-11 w-11 shrink-0" : "h-12 w-12"
            }`}
            disabled={
              isSendingMessage ||
              sendingMessageRef.current ||
              (!isGroupChat && (isUserBlocked() || !canMessageDirectUser))
            }
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
          </MessageComposer>
        }
      />

      <Suspense fallback={null}>
        <CreatePollModal
          isOpen={showPollModal}
          onClose={() => setShowPollModal(false)}
          onSubmit={handleCreatePoll}
        />
      </Suspense>

      <ForwardMessageModal
        isOpen={showForwardModal}
        onClose={() => {
          setShowForwardModal(false);
          setForwardingMessage(null);
        }}
        chats={chatSummaries.filter(
          (chat) => chat.conversationKey !== selectedConversationKey
        )}
        onForward={async (chat) => {
          if (!socket || !forwardingMessage) return;

          const payload = await buildForwardPayload(forwardingMessage, chat);
          const forwardId =
            globalThis.crypto?.randomUUID?.() ||
            `forward-${Date.now()}-${Math.random()}`;
          socket.emit("send_message", {
            ...payload,
            clientMessageId: forwardId,
            clientTempId: forwardId,
            requestId: forwardId,
          }, (ack) => {
            if (!ack?.ok) {
              toast.error(ack?.error || "Failed to forward message.");
              return;
            }

            toast.success("Message forwarded.");
            setShowForwardModal(false);
            setForwardingMessage(null);
          });
        }}
      />

      <StarredMessagesModal
        isOpen={showStarredModal}
        onClose={() => setShowStarredModal(false)}
        messages={starredMessages}
        onJumpToMessage={jumpToMessageAndCloseModal}
      />

      <GroupCallPickerModal
        isOpen={showGroupCallPicker}
        onClose={() => setShowGroupCallPicker(false)}
        members={groupCallableMembers}
        callType={groupCallMode}
        onStartCall={startGroupMemberCall}
      />

      <Suspense fallback={null}>
        <ImageModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          imageUrl={selectedImage}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ScheduleMessageModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          selectedChatData={selectedChatData}
          isGroupChat={isGroupChat}
          conversationKey={selectedConversationKey}
          draftText={text}
          occasionType={scheduleOccasionType}
        />
      </Suspense>

      <Suspense fallback={null}>
        <AIAssistModal
          isOpen={aiAssistModal.isOpen}
          title={aiAssistModal.title}
          subtitle={aiAssistModal.subtitle}
          loading={aiAssistModal.loading}
          value={aiAssistModal.value}
          onClose={() =>
            setAiAssistModal({
              isOpen: false,
              loading: false,
              title: "",
              subtitle: "",
              value: "",
            })
          }
          onUse={() => {
            setText(aiAssistModal.value);
            setAiAssistModal({
              isOpen: false,
              loading: false,
              title: "",
              subtitle: "",
              value: "",
            });
          }}
        />
      </Suspense>

      <Suspense fallback={null}>
        <AIAssistModal
          isOpen={summaryModal.isOpen}
          title="Chat summary"
          subtitle="AI-generated recap of this conversation"
          loading={summaryModal.loading}
          value={summaryModal.value}
          onClose={() => setSummaryModal({ isOpen: false, loading: false, value: "" })}
          onUse={() => {
            setText(summaryModal.value);
            setSummaryModal({ isOpen: false, loading: false, value: "" });
          }}
        />
      </Suspense>

      <Suspense fallback={null}>
        <PremiumUpgradeModal
          isOpen={showPremiumModal}
          onClose={() => setShowPremiumModal(false)}
        />
      </Suspense>
    </>
  );
}

const mapStateToProps = ({ Home, call }) => ({
  ...Home,
  ...call,
});

export default connect(mapStateToProps)(Chat);
