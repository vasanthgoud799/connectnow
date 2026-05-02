import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Bell, LogOut, PencilLine, Search, UserCircle2, X } from "lucide-react";

import { useAppStore } from "@/store";
import ThemeToggle from "@/components/ThemeToggle";
import { useNavigate } from "react-router-dom";

function UserInfo({
  onOpenGlobalSearch,
  onOpenNotifications,
  onLogout,
  notificationUnreadCount = 0,
  activeUsers = [],
  pageTitle = "Messages",
}) {
  const { userInfo } = useAppStore();
  const navigate = useNavigate();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  return (
    <>
    <header className="themed-topbar border-b px-4 py-3 md:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={userInfo?.image || "/avatar.png"}
            alt="avatar"
            className="themed-glow-avatar h-10 w-10 rounded-full object-cover md:h-11 md:w-11"
          />
          <div className="min-w-0">
            <p className="themed-title truncate font-['Space_Grotesk'] text-[1.15rem] font-semibold tracking-[-0.03em] md:text-[1.45rem]">
              {pageTitle}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] md:text-xs">
              <p className="themed-subtitle truncate max-w-[220px] md:max-w-none">
                {(userInfo?.firstName || "Guest") +
                  (userInfo?.email ? ` - ${userInfo.email}` : "")}
              </p>
              <span className="themed-section-label hidden sm:inline-flex">Personal workspace</span>
            </div>
          </div>
        </div>

        <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 xl:justify-end">
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen(true)}
            className="themed-stat-chip inline-flex shrink-0 items-center justify-center gap-2 md:hidden"
          >
            <UserCircle2 className="h-4 w-4" />
            <span>Profile</span>
          </button>
          <div className="shrink-0">
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={onOpenGlobalSearch}
            className="themed-stat-chip inline-flex shrink-0 min-w-0 items-center justify-center gap-2"
          >
            <Search className="h-4 w-4" />
            <span>Search</span>
          </button>
          <button
            type="button"
            onClick={onOpenNotifications}
            className="themed-stat-chip relative inline-flex shrink-0 min-w-0 items-center justify-center gap-2"
          >
            <Bell className="h-4 w-4" />
            <span className="truncate">Notifications</span>
            {notificationUnreadCount > 0 && (
              <span className="absolute -right-2 top-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1.5 text-[10px] font-semibold text-slate-950">
                {notificationUnreadCount}
              </span>
            )}
          </button>
          <div className="themed-stat-chip inline-flex shrink-0 min-w-0 items-center justify-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="truncate">Online Contacts:</span>
            <span className="themed-title font-semibold">{activeUsers.length}</span>
          </div>
        </div>
      </div>
    </header>
    {isProfileMenuOpen &&
      createPortal(
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setIsProfileMenuOpen(false)}
          />
          <div className="themed-modal-surface fixed inset-x-4 top-20 z-50 rounded-[28px] border border-white/10 p-4 shadow-[0_24px_70px_rgba(2,8,23,0.32)] md:hidden">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={userInfo?.image || "/avatar.png"}
                  alt="profile avatar"
                  className="themed-glow-avatar h-12 w-12 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="themed-title truncate text-sm font-semibold">
                    {userInfo?.firstName || "Guest"}
                  </p>
                  <p className="themed-subtitle truncate text-xs">
                    {userInfo?.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="themed-panel-soft rounded-full p-2"
                onClick={() => setIsProfileMenuOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className="themed-panel-soft flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm transition hover:opacity-90"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  navigate("/profile");
                }}
              >
                <PencilLine className="h-4 w-4" />
                Edit profile
              </button>
              <button
                type="button"
                className="themed-panel-soft flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm transition hover:opacity-90"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  onLogout?.();
                }}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export default UserInfo;
