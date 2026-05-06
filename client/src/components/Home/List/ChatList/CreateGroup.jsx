import { useEffect, useMemo, useState } from "react";
import { Check, UsersRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import {
  CREATE_GROUP_ROUTE,
  LIST_CONTACTS_ROUTE,
  UPLOAD_FILE_ROUTE,
} from "@/utils/constants";
import { toast } from "sonner";

function CreateGroup({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contacts, setContacts] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const response = await apiClient.get(LIST_CONTACTS_ROUTE, {
          withCredentials: true,
        });
        setContacts(response.data.contacts || []);
      } catch (error) {
        console.error("Error loading contacts:", error);
      }
    };

    loadContacts();
  }, []);

  useEffect(() => {
    if (!avatar) {
      setAvatarPreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(avatar);
    setAvatarPreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [avatar]);

  const canCreate =
    name.trim().length >= 2 && selectedMembers.length >= 1;

  const selectedSet = useMemo(
    () => new Set(selectedMembers),
    [selectedMembers]
  );

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) =>
      `${c.firstName} ${c.lastName} ${c.email}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [contacts, search]);

  const toggleMember = (memberId) => {
    setSelectedMembers((current) =>
      current.includes(memberId)
        ? current.filter((item) => item !== memberId)
        : [...current, memberId]
    );
  };

  const handleCreate = async () => {
    if (!canCreate) {
      toast.error("Add a group name and at least one member.");
      return;
    }

    try {
      setLoading(true);

      let imageUpload = null;
      if (avatar) {
        const formData = new FormData();
        formData.append("file", avatar);
        formData.append("stableMedia", "true");
        const uploadResponse = await apiClient.post(UPLOAD_FILE_ROUTE, formData, {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" },
        });
        imageUpload = uploadResponse.data;
      }

      const response = await apiClient.post(
        CREATE_GROUP_ROUTE,
        {
          name: name.trim(),
          description: description.trim(),
          members: selectedMembers,
          image: "",
          imageUpload,
        },
        {
          withCredentials: true,
        }
      );

      toast.success("Group created");
      onCreated?.(response.data.group);
    } catch (error) {
      console.error("Error creating group:", error);
      toast.error(
        error.response?.data?.message || "Could not create group."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm md:items-center md:p-4">
      <div className="themed-modal-surface animate-in fade-in zoom-in-95 duration-200 flex h-[92dvh] w-full max-w-[1120px] flex-col overflow-hidden rounded-t-[32px] backdrop-blur-xl shadow-[0_30px_80px_rgba(2,8,23,0.25)] md:h-auto md:max-h-[min(92vh,900px)] md:rounded-[32px]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 md:px-6">
          <div>
            <p className="themed-accent-text text-xs uppercase tracking-[0.28em]">
              New group
            </p>
            <h3 className="themed-title mt-2 text-2xl font-semibold">
              Create a group
            </h3>
          </div>
          <button
            onClick={onClose}
            className="themed-panel-soft rounded-full p-2 transition hover:opacity-90"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-5 overflow-hidden p-4 md:p-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          
          {/* LEFT */}
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1 md:pr-2">
            
            {/* Avatar Upload */}
            <div className="themed-page-card flex items-center gap-4 rounded-[24px] p-4">
              <label className="cursor-pointer">
                <div className="themed-panel-soft flex h-20 w-20 items-center justify-center overflow-hidden rounded-[26px]">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Group preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UsersRound className="themed-title h-7 w-7" />
                  )}
                </div>
                <input
                  type="file"
                  hidden
                  onChange={(e) => setAvatar(e.target.files[0])}
                />
              </label>
              <div className="min-w-0">
                <p className="themed-title text-base font-semibold">Group photo</p>
                <p className="themed-subtitle text-sm leading-6">
                  Upload a square image for a cleaner group identity.
                </p>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="themed-subtitle mb-2 block text-sm">
                Group name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weekend circle"
                className="themed-input h-12 rounded-2xl"
              />
            </div>

            {/* Description */}
            <div>
              <label className="themed-subtitle mb-2 block text-sm">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this group for?"
                className="themed-input min-h-[120px] w-full rounded-2xl px-4 py-3 text-sm outline-none"
              />
            </div>

            {/* Selected Members */}
            <div className="themed-page-card rounded-[24px] p-4">
              <p className="themed-title text-sm font-medium">
                {selectedMembers.length} member(s) selected
              </p>

              <div className="mt-3 flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
                {contacts.filter((c) => selectedSet.has(c._id)).length ? (
                  contacts
                    .filter((c) => selectedSet.has(c._id))
                    .map((c) => (
                      <div
                        key={c._id}
                        className="themed-chip flex max-w-full items-center gap-2 rounded-full px-3 py-1"
                      >
                        <img
                          src={c.image || "/avatar.png"}
                          className="h-6 w-6 rounded-full"
                        />
                        <span className="truncate text-xs">
                          {c.firstName || c.email}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="themed-subtitle text-sm">
                    Pick one or more contacts to see them here before creating the group.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="themed-title text-base font-semibold">
                  Choose members
                </p>
                <p className="themed-subtitle text-sm">
                  Select contacts to add into this group.
                </p>
              </div>
              <div className="themed-stat-chip hidden shrink-0 sm:inline-flex">
                {filteredContacts.length} visible
              </div>
            </div>

            {/* Search */}
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members..."
              className="themed-input mb-3 h-12 rounded-2xl"
            />

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 md:pr-2 scroll-smooth">
              {filteredContacts.length === 0 && (
                <p className="themed-subtitle mt-10 text-center">
                  No contacts found
                </p>
              )}

              {filteredContacts.map((contact) => {
                const contactId = contact._id;
                const checked = selectedSet.has(contactId);

                return (
                  <button
                    key={contactId}
                    onClick={() => toggleMember(contactId)}
                    className={`flex w-full items-center justify-between gap-4 rounded-[24px] border px-4 py-3 text-left transition hover:scale-[1.01] ${
                      checked
                        ? "border-cyan-300/40 bg-cyan-400/10"
                        : "themed-conversation-card hover:opacity-95"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <img
                        src={contact.image || "/avatar.png"}
                        alt="Member"
                        className="themed-glow-avatar h-12 w-12 rounded-2xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="themed-title truncate text-[1rem] font-semibold">
                          {[contact.firstName, contact.lastName]
                            .filter(Boolean)
                            .join(" ") || contact.email}
                        </p>
                        <p className="themed-subtitle truncate text-sm">
                          {contact.email}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                        checked
                          ? "border-cyan-300 bg-cyan-300 text-slate-950"
                          : "border-white/10 text-transparent"
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 px-4 py-4 md:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="themed-action-neutral h-12 rounded-2xl px-5"
            >
              Close
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!canCreate || loading}
              className="h-12 rounded-2xl bg-gradient-to-r from-[#f97316] to-[#38bdf8] px-6 text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? "Creating..." : "Create group"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateGroup;
