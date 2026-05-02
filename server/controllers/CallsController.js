import Call from "../models/CallModel.js";

export const listCalls = async (req, res) => {
  try {
    const calls = await Call.find({
      $or: [{ caller: req.userId }, { recipient: req.userId }],
    })
      .populate("caller", "firstName lastName email image")
      .populate("recipient", "firstName lastName email image")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({ calls });
  } catch (error) {
    console.error("Error fetching calls:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getIceConfiguration = async (_req, res) => {
  const stunServers = (process.env.WEBRTC_STUN_SERVERS ||
    "stun:stun.l.google.com:19302").split(",");

  const turnServers = (process.env.WEBRTC_TURN_URLS || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  const iceServers = [
    ...stunServers
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => ({ urls: url })),
    ...turnServers.map((url) => ({
      urls: url,
      username: process.env.WEBRTC_TURN_USERNAME || "",
      credential: process.env.WEBRTC_TURN_CREDENTIAL || "",
    })),
  ];

  return res.status(200).json({
    iceServers: iceServers.length
      ? iceServers
      : [{ urls: "stun:stun.l.google.com:19302" }],
  });
};

export const logCall = async (req, res) => {
  try {
    const { recipientId, type = "video", status = "initiated" } = req.body;

    if (!recipientId) {
      return res.status(400).json({ message: "recipientId is required." });
    }

    const call = await Call.create({
      caller: req.userId,
      recipient: recipientId,
      type,
      status,
      startedAt: new Date(),
    });

    return res.status(201).json({ call });
  } catch (error) {
    console.error("Error logging call:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateCallStatus = async (req, res) => {
  try {
    const { callId, status, endedAt, durationSeconds } = req.body;

    if (!callId || !status) {
      return res.status(400).json({ message: "callId and status are required." });
    }

    const call = await Call.findOneAndUpdate(
      {
        _id: callId,
        $or: [{ caller: req.userId }, { recipient: req.userId }],
      },
      {
        status,
        endedAt: endedAt || (status === "ended" ? new Date() : undefined),
        durationSeconds: durationSeconds ?? undefined,
      },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({ message: "Call not found." });
    }

    return res.status(200).json({ call });
  } catch (error) {
    console.error("Error updating call:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
