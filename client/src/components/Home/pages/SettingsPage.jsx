import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Crown,
  Languages,
  Lock,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAppStore } from "@/store";
import { apiClient } from "@/lib/api-client";
import {
  AI_SETTINGS_ROUTE,
  SECURITY_BACKUP_CODES_ROUTE,
  SECURITY_DATA_EXPORT_ROUTE,
  SECURITY_REVOKE_OTHERS_ROUTE,
  SECURITY_SESSIONS_ROUTE,
} from "@/utils/constants";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import RouteLoader from "@/components/ui/RouteLoader";
import { toast } from "sonner";
import {
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from "@/utils/browserNotifications";

const PremiumUpgradeModal = lazy(() => import("../PremiumUpgradeModal"));

function SettingsPage() {
  const navigate = useNavigate();
  const {
    userInfo,
    setUserInfo,
    sessions,
    trustedDevices,
    securityEvents,
    adminDashboard,
    fetchSecuritySnapshot,
    browserNotificationsEnabled,
    setBrowserNotificationsEnabled,
  } = useAppStore();
  const [aiEnabled, setAiEnabled] = useState(Boolean(userInfo?.aiPreferences?.enabled));
  const [translationLanguage, setTranslationLanguage] = useState(
    userInfo?.aiPreferences?.translationLanguage || "English"
  );
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    getBrowserNotificationPermission()
  );
  const browserNotificationsSupported = isBrowserNotificationSupported();

  const subscription = userInfo?.subscription || { plan: "free", expiresAt: null };
  const isPremiumUser =
    subscription.plan === "premium" &&
    (!subscription.expiresAt || new Date(subscription.expiresAt).getTime() > Date.now());
  const aiUsage = userInfo?.aiUsage || { count: 0 };
  const aiDailyLimit = Number(userInfo?.aiDailyLimit ?? 0);
  const aiRemaining = Number(userInfo?.aiRemaining ?? Math.max(aiDailyLimit - aiUsage.count, 0));
  const premiumLabel = useMemo(() => {
    if (!isPremiumUser) return "Free plan";
    if (!subscription.expiresAt) return "Premium active";
    return `Premium until ${new Date(subscription.expiresAt).toLocaleDateString()}`;
  }, [isPremiumUser, subscription.expiresAt]);

  useEffect(() => {
    setAiEnabled(Boolean(userInfo?.aiPreferences?.enabled));
    setTranslationLanguage(userInfo?.aiPreferences?.translationLanguage || "English");
  }, [userInfo?.aiPreferences]);

  useEffect(() => {
    fetchSecuritySnapshot({ isAdmin: userInfo?.role === "admin" });
  }, [fetchSecuritySnapshot, userInfo?.role]);

  const saveAISettings = async (nextEnabled = aiEnabled, nextLanguage = translationLanguage) => {
    if (!isPremiumUser) {
      setShowPremiumModal(true);
      return;
    }

    try {
      const response = await apiClient.post(
        AI_SETTINGS_ROUTE,
        {
          enabled: nextEnabled,
          preferredTone: userInfo?.aiPreferences?.preferredTone || "friendly",
          translationLanguage: nextLanguage,
        },
        { withCredentials: true }
      );

      setUserInfo({
        ...userInfo,
        aiPreferences: response.data.preferences,
      });
      toast.success("AI settings updated.");
    } catch (error) {
      console.error("Error saving AI settings:", error);
      toast.error("Unable to update AI settings.");
    }
  };

  const revokeSession = async (sessionId) => {
    try {
      await apiClient.delete(`${SECURITY_SESSIONS_ROUTE}/${sessionId}`, {
        withCredentials: true,
      });
      setSessions((items) =>
        items.map((item) =>
          item.id === sessionId ? { ...item, revokedAt: new Date().toISOString() } : item
        )
      );
      toast.success("Session revoked.");
    } catch (error) {
      console.error("Error revoking session:", error);
      toast.error("Unable to revoke session.");
    }
  };

  const revokeOtherSessions = async () => {
    try {
      await apiClient.post(SECURITY_REVOKE_OTHERS_ROUTE, {}, { withCredentials: true });
      setSessions((items) =>
        items.map((item) =>
          item.current ? item : { ...item, revokedAt: new Date().toISOString() }
        )
      );
      toast.success("Other sessions revoked.");
    } catch (error) {
      console.error("Error revoking other sessions:", error);
      toast.error("Unable to revoke other sessions.");
    }
  };

  const exportMyData = async () => {
    try {
      const response = await apiClient.get(SECURITY_DATA_EXPORT_ROUTE, {
        withCredentials: true,
      });
      const dataBlob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: "application/json",
      });
      const objectUrl = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `connectnow-security-export-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      toast.success("Data export downloaded.");
    } catch (error) {
      console.error("Error exporting data:", error);
      toast.error("Unable to export account data.");
    }
  };

  const generateBackupCodes = async () => {
    try {
      const response = await apiClient.post(
        SECURITY_BACKUP_CODES_ROUTE,
        {},
        { withCredentials: true }
      );
      const codes = response.data?.codes || [];
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("Backup codes regenerated and copied.");
    } catch (error) {
      console.error("Error generating backup codes:", error);
      toast.error(error?.response?.data?.message || "Unable to generate backup codes.");
    }
  };

  const handleBrowserNotificationToggle = async (checked) => {
    if (!browserNotificationsSupported) {
      toast.error("Browser notifications are not supported on this device.");
      return;
    }

    if (!checked) {
      setBrowserNotificationsEnabled(false);
      toast.success("Browser notifications turned off.");
      return;
    }

    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await requestBrowserNotificationPermission();
    setNotificationPermission(permission);

    if (permission !== "granted") {
      setBrowserNotificationsEnabled(false);
      toast.error("Allow browser notifications to enable message and call alerts.");
      return;
    }

    setBrowserNotificationsEnabled(true);
    toast.success("Browser notifications turned on.");
  };

  const handleTestBrowserNotification = () => {
    const permission = getBrowserNotificationPermission();
    setNotificationPermission(permission);
    if (!browserNotificationsEnabled || permission !== "granted") {
      toast.error("Enable browser notifications before sending a test.");
      return;
    }

    showBrowserNotification({
      title: "ConnectNow notifications",
      body: "Message and call alerts are ready.",
      tag: "connectnow:test-notification",
      data: {
        notificationKind: "message",
      },
    });
    toast.success("Test notification sent.");
  };

  return (
 <div className="flex min-h-0 flex-1 flex-col px-6 pb-5 pt-4 overflow-y-auto no-scrollbar">
      <div className="themed-page-card rounded-[28px] p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="themed-panel-soft themed-card-hover rounded-[24px] p-5 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="themed-icon-chip">
              <UserRound className="h-5 w-5" />
            </div>
            <p className="themed-title font-medium">Profile</p>
          </div>
          <p className="themed-subtitle mt-3 text-sm">
            Update avatar, about text, and public identity.
          </p>
        </button>

        <div className="themed-panel-soft themed-card-hover rounded-[24px] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="themed-icon-chip">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <p className="themed-title font-medium">Notifications</p>
                <p className="themed-subtitle mt-3 text-sm">
                  Get browser alerts for new messages and incoming calls when the chat is not in front.
                </p>
              </div>
            </div>
            <Switch
              checked={browserNotificationsEnabled}
              onCheckedChange={handleBrowserNotificationToggle}
            />
          </div>
          <p className="themed-subtitle mt-3 text-xs">
            {browserNotificationsSupported
              ? browserNotificationsEnabled
                ? "Browser notifications are enabled for messages and calls."
                : "Enable notifications to get desktop or mobile browser alerts."
              : "This browser does not support notifications."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="themed-chip rounded-full px-3 py-1 text-xs">
              Permission: {notificationPermission}
            </span>
            <button
              type="button"
              onClick={handleTestBrowserNotification}
              className="themed-action-neutral rounded-full px-3 py-1.5 text-xs"
            >
              Test notification
            </button>
          </div>
        </div>

        <div className="themed-panel-soft themed-card-hover rounded-[24px] p-5">
          <div className="flex items-center gap-3">
            <div className="themed-icon-chip">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="themed-title font-medium">Privacy</p>
          </div>
          <p className="themed-subtitle mt-3 text-sm">
            Blocked users: {userInfo?.blockedUsers?.length || 0}
          </p>
        </div>

        <div className="themed-panel-soft themed-card-hover rounded-[24px] p-5">
          <div className="flex items-center gap-3">
            <div className="themed-icon-chip">
              <MonitorSmartphone className="h-5 w-5" />
            </div>
            <p className="themed-title font-medium">Experience</p>
          </div>
          <p className="themed-subtitle mt-3 text-sm">
            Theme preference is saved locally and follows system mode by default.
          </p>
        </div>

        <div className="themed-panel-soft rounded-[24px] p-5 lg:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="themed-icon-chip">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="themed-title font-medium">Active sessions</p>
                <p className="themed-subtitle mt-1 text-sm">
                  {sessions.filter((session) => !session.revokedAt).length || 0} signed-in devices
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={revokeOtherSessions}
              className="rounded-full bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/25"
            >
              Sign out others
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {sessions.slice(0, 4).map((session) => (
              <div
                key={session.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="themed-title text-sm font-medium">
                    {session.current ? "This device" : session.deviceLabel || "Unknown device"}
                  </p>
                  <p className="themed-subtitle mt-1 text-xs">
                    Last active {session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString() : "recently"}
                  </p>
                </div>
                {!session.current && !session.revokedAt && (
                  <button
                    type="button"
                    onClick={() => revokeSession(session.id)}
                    className="rounded-full bg-white/10 px-3 py-2 text-xs themed-title transition hover:bg-white/15"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="themed-panel-soft rounded-[24px] p-5 lg:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="themed-title font-medium">Trusted devices</p>
              <p className="themed-subtitle mt-1 text-sm">
                {trustedDevices.length} remembered device{trustedDevices.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={generateBackupCodes}
                className="rounded-full bg-white/10 px-4 py-2 text-sm themed-title transition hover:bg-white/15"
              >
                Regenerate backup codes
              </button>
              <button
                type="button"
                onClick={exportMyData}
                className="rounded-full bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25"
              >
                Download my data
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {trustedDevices.length ? (
              trustedDevices.slice(0, 4).map((device) => (
                <div
                  key={device._id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <p className="themed-title text-sm font-medium">{device.label || "Trusted device"}</p>
                  <p className="themed-subtitle mt-1 text-xs">
                    Trusted {device.trustedAt ? new Date(device.trustedAt).toLocaleString() : "recently"}
                  </p>
                </div>
              ))
            ) : (
              <p className="themed-subtitle text-sm">No trusted devices saved yet.</p>
            )}
          </div>
        </div>

        {userInfo?.role === "admin" && adminDashboard && (
          <div className="themed-panel-soft rounded-[24px] p-5 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="themed-icon-chip">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="themed-title font-medium">Security operations dashboard</p>
                <p className="themed-subtitle mt-1 text-sm">
                  Last {adminDashboard.windowHours || 24} hours of platform auth telemetry
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {[
                ["Brute force", adminDashboard.alerts?.bruteForce || 0],
                ["Token abuse", adminDashboard.alerts?.tokenAbuse || 0],
                ["Hijack indicators", adminDashboard.alerts?.sessionHijackingIndicators || 0],
                ["Mass failed requests", adminDashboard.alerts?.massFailedRequests || 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="themed-subtitle text-xs uppercase tracking-[0.2em]">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="themed-panel-soft rounded-[24px] p-5 lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="themed-icon-chip">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="themed-title font-medium">Recent security activity</p>
          </div>
          <div className="mt-4 grid gap-3">
            {securityEvents.length ? (
              securityEvents.map((event) => (
                <div
                  key={event._id || `${event.type}-${event.createdAt}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <p className="themed-title text-sm font-medium">{event.type}</p>
                  <p className="themed-subtitle mt-1 text-xs">
                    {event.createdAt ? new Date(event.createdAt).toLocaleString() : ""}
                  </p>
                </div>
              ))
            ) : (
              <p className="themed-subtitle text-sm">No recent security events.</p>
            )}
          </div>
        </div>

        <div className="rounded-[24px] bg-gradient-to-br from-violet-500/15 via-slate-900/80 to-cyan-400/10 p-[1px] lg:col-span-2">
          <div className="flex h-full flex-col gap-4 rounded-[23px] bg-slate-600/60 p-5 text-white md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 p-3">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-cyan-200/80">
                  Premium AI
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {isPremiumUser ? "Premium active" : "Unlock AI features"}
                </p>
                <p className="mt-2 text-sm text-slate-300">{premiumLabel}</p>
                <p className="mt-1 text-sm text-slate-300">
                  {isPremiumUser
                    ? `${aiRemaining} of ${aiDailyLimit} AI uses left today`
                    : "Smart replies, summaries, translation, and tone rewrite are premium only."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPremiumModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/15"
            >
              {isPremiumUser ? <Crown className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {isPremiumUser ? "Manage plan" : "Upgrade to Premium"}
            </button>
          </div>
        </div>

        <div className="themed-panel-soft rounded-[24px] p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="themed-icon-chip">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="themed-title font-medium">AI Assist</p>
                <p className="themed-subtitle mt-2 text-sm">
                  Opt in to smart replies, translation, tone rewrite, and chat summaries.
                </p>
              </div>
            </div>
            <Switch
              checked={aiEnabled}
              onCheckedChange={(checked) => {
                if (!isPremiumUser) {
                  setShowPremiumModal(true);
                  return;
                }
                setAiEnabled(checked);
                saveAISettings(checked, translationLanguage);
              }}
              disabled={!isPremiumUser}
            />
          </div>

          {!isPremiumUser && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm themed-title">
              <Lock className="h-4 w-4" />
              AI messaging is locked on the free plan. Upgrade to Premium to enable it.
            </div>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="themed-panel-soft rounded-[20px] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Languages className="h-4 w-4" />
                <p className="themed-title text-sm font-medium">Default translation language</p>
              </div>
              <Input
                value={translationLanguage}
                onChange={(event) => setTranslationLanguage(event.target.value)}
                onBlur={() => saveAISettings(aiEnabled, translationLanguage)}
                className="themed-input h-11 rounded-2xl px-4"
                disabled={!isPremiumUser}
              />
            </div>
            <div className="themed-panel-soft rounded-[20px] p-4">
              <p className="themed-title text-sm font-medium">Privacy</p>
              <p className="themed-subtitle mt-3 text-sm">
                AI runs only when you opt in. Requests are sent from the server, never directly from the browser.
              </p>
            </div>
          </div>
        </div>
        </div>
      </div>

      <Suspense fallback={<RouteLoader message="Loading premium options..." />}>
        <PremiumUpgradeModal
          isOpen={showPremiumModal}
          onClose={() => setShowPremiumModal(false)}
        />
      </Suspense>
    </div>
  );
}

export default SettingsPage;
