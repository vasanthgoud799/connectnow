import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  clearDirectContactVerification,
  getDirectContactTrustState,
  verifyDirectContactFingerprint,
} from "@/crypto/e2eeService";

export const useTrustStatus = ({
  isGroupChat,
  selectedChatId,
  currentUserId,
  displayName,
}) => {
  const [contactTrustState, setContactTrustState] = useState(null);
  const [loadingContactTrustState, setLoadingContactTrustState] = useState(false);

  useEffect(() => {
    let ignore = false;

    const loadTrustState = async () => {
      if (isGroupChat || !currentUserId || !selectedChatId) {
        if (!ignore) {
          setContactTrustState(null);
          setLoadingContactTrustState(false);
        }
        return;
      }

      try {
        setLoadingContactTrustState(true);
        const nextTrustState = await getDirectContactTrustState({
          currentUserId,
          contactId: selectedChatId,
        });
        if (!ignore) {
          setContactTrustState(nextTrustState);
        }
      } catch (error) {
        if (!ignore) {
          setContactTrustState(null);
        }
        console.error("Error loading contact trust state:", error);
      } finally {
        if (!ignore) {
          setLoadingContactTrustState(false);
        }
      }
    };

    loadTrustState();
    return () => {
      ignore = true;
    };
  }, [currentUserId, isGroupChat, selectedChatId]);

  const verifyCurrentFingerprint = async () => {
    if (!selectedChatId || !contactTrustState?.fingerprint) return;

    try {
      await verifyDirectContactFingerprint({
        contactId: selectedChatId,
        fingerprint: contactTrustState.fingerprint,
        displayName: displayName || "Contact",
      });
      setContactTrustState((currentState) =>
        currentState
          ? {
              ...currentState,
              status: "verified",
              trustedFingerprint: currentState.fingerprint,
              verifiedAt: new Date().toISOString(),
            }
          : currentState
      );
      toast.success("Contact fingerprint marked as verified.");
    } catch (error) {
      toast.error(error.message || "Unable to verify this fingerprint.");
    }
  };

  const clearFingerprintVerification = async () => {
    if (!selectedChatId) return;

    try {
      await clearDirectContactVerification(selectedChatId);
      setContactTrustState((currentState) =>
        currentState
          ? {
              ...currentState,
              status: "unverified",
              trustedFingerprint: null,
              verifiedAt: null,
            }
          : currentState
      );
      toast.success("Fingerprint verification cleared.");
    } catch (error) {
      toast.error(error.message || "Unable to clear fingerprint verification.");
    }
  };

  return {
    contactTrustState,
    loadingContactTrustState,
    verifyCurrentFingerprint,
    clearFingerprintVerification,
  };
};

export default useTrustStatus;
