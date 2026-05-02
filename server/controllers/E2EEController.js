import Group from "../models/GroupModel.js";
import User from "../models/UserModel.js";

const sanitizePublicKeyOwner = (user) => ({
  userId: String(user._id),
  publicKeyJwk: user.e2eePublicKeyJwk || null,
  algorithm: user.e2eeKeyAlgorithm || null,
  keyVersion: Number(user.e2eeKeyVersion || 1),
  fingerprint: user.e2eePublicKeyFingerprint || null,
  ecdhPublicKeyJwk: user.e2eeEcdhPublicKeyJwk || null,
  ecdhKeyVersion: Number(user.e2eeEcdhKeyVersion || 1),
  ecdhFingerprint: user.e2eeEcdhPublicKeyFingerprint || null,
});

export const upsertPublicKey = async (req, res) => {
  try {
    const {
      publicKeyJwk,
      algorithm,
      keyVersion = 1,
      fingerprint = null,
      ecdhPublicKeyJwk = null,
      ecdhKeyVersion = 1,
      ecdhFingerprint = null,
    } = req.body || {};

    if (!publicKeyJwk || typeof publicKeyJwk !== "object") {
      return res.status(400).json({ message: "publicKeyJwk is required." });
    }

    if (algorithm !== "RSA-OAEP") {
      return res.status(400).json({ message: "Only RSA-OAEP is supported." });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        $set: {
          e2eePublicKeyJwk: publicKeyJwk,
          e2eeKeyAlgorithm: algorithm,
          e2eeKeyVersion: Number(keyVersion || 1),
          e2eePublicKeyFingerprint: fingerprint || null,
          e2eeEcdhPublicKeyJwk: ecdhPublicKeyJwk || null,
          e2eeEcdhKeyVersion: Number(ecdhKeyVersion || 1),
          e2eeEcdhPublicKeyFingerprint: ecdhFingerprint || null,
        },
      },
      {
        new: true,
      }
    ).select(
      "_id e2eePublicKeyJwk e2eeKeyAlgorithm e2eeKeyVersion e2eePublicKeyFingerprint e2eeEcdhPublicKeyJwk e2eeEcdhKeyVersion e2eeEcdhPublicKeyFingerprint"
    );

    return res.status(200).json({
      key: sanitizePublicKeyOwner(user),
    });
  } catch (error) {
    console.error("Error saving E2EE public key:", error);
    return res.status(500).json({ message: "Failed to save public key." });
  }
};

export const getConversationKeys = async (req, res) => {
  try {
    const { userId, groupId } = req.query;

    if (!userId && !groupId) {
      return res.status(400).json({ message: "userId or groupId is required." });
    }

    if (userId) {
      const users = await User.find({
        _id: { $in: [req.userId, userId] },
      }).select(
        "_id e2eePublicKeyJwk e2eeKeyAlgorithm e2eeKeyVersion e2eePublicKeyFingerprint e2eeEcdhPublicKeyJwk e2eeEcdhKeyVersion e2eeEcdhPublicKeyFingerprint"
      );

      return res.status(200).json({
        keys: users.map(sanitizePublicKeyOwner),
      });
    }

    const group = await Group.findById(groupId).select("members");
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    const isMember = group.members.some(
      (member) => String(member.user?._id || member.user) === String(req.userId)
    );

    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    const memberIds = [
      ...new Set(group.members.map((member) => String(member.user?._id || member.user))),
    ];
    const users = await User.find({
      _id: { $in: memberIds },
    }).select(
        "_id e2eePublicKeyJwk e2eeKeyAlgorithm e2eeKeyVersion e2eePublicKeyFingerprint e2eeEcdhPublicKeyJwk e2eeEcdhKeyVersion e2eeEcdhPublicKeyFingerprint"
    );

    return res.status(200).json({
      keys: users.map(sanitizePublicKeyOwner),
    });
  } catch (error) {
    console.error("Error fetching conversation keys:", error);
    return res.status(500).json({ message: "Failed to fetch public keys." });
  }
};
