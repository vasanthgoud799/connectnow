import jwt from "jsonwebtoken";
import User from "../models/UserModel.js";
import { compare } from "bcrypt";

const dur = 3 * 24 * 60 * 60 * 1000; // Example token duration

const createToken = (email, userId) => {
  return jwt.sign({ email, userId }, process.env.JWT_KEY, {
    expiresIn: dur / 1000,
  });
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and Password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const auth = await compare(password, user.password);
    if (!auth) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    // Update status to "Online"
    user.status = "Online";
    await user.save();

    res.cookie("jwt", createToken(email, user.id), {
      dur,
      secure: true, // Set to true if using HTTPS
      sameSite: "None",
    });

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        profileSetUp: user.profileSetup,
        friends: user.friends,
        firstName: user.firstName,
        lastName: user.lastName,
        image: user.image,
        blockedUsers: user.blockedUsers,
        status: user.status, // Ensure status is returned
      },
    });
  } catch (err) {
    console.error("Error during login:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const signUp = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and Password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({ email, password });
    user.status = "Online";
    await user.save();
    res.cookie("jwt", createToken(email, user.id), {
      dur,
      secure: true,
      sameSite: "None",
    });

    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        profileSetUp: user.profileSetup,
      },
    });
  } catch (err) {
    console.error("Error during sign up:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getUserInfo = async (req, res, next) => {
  try {
    const userData = await User.findById(req.userId);
    if (!userData) {
      return res.status(404).send("User with given id not found");
    }
    return res.status(200).json({
      id: userData.id,
      email: userData.email,
      profileSetUp: userData.profileSetup,
      firstName: userData.firstName,
      lastName: userData.lastName,
      image: userData.image,
      friends: userData.friends,
      blockedUsers: userData.blockedUsers,
    });
  } catch (err) {
    console.error("Error during sign up:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// controllers/AuthController.js

export const updateProfile = async (req, res) => {
  try {
    const { userId } = req;
    // console.log("User ID in updateProfile:", userId); // Add this line for debugging
    const { firstName, lastName, image, about } = req.body;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No user ID provided" });
    }

    if (!firstName || !lastName || !image) {
      return res
        .status(400)
        .json({ message: "First Name, Last Name, and Image are required" });
    }

    const userData = await User.findByIdAndUpdate(
      userId,
      {
        firstName,
        lastName,
        image,
        about,
        profileSetup: true,
      },
      { new: true, runValidators: true }
    );

    if (!userData) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      id: userData.id,
      email: userData.email,
      profileSetUp: userData.profileSetup,
      firstName: userData.firstName,
      lastName: userData.lastName,
      image: userData.image,
      about: userData.about,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Error updating profile", error });
  }
};

export const logout = async (req, res) => {
  try {
    const { userId } = req;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No user ID provided" });
    }

    await User.findByIdAndUpdate(userId, { status: "Offline" });

    res.cookie("jwt", "", {
      expires: new Date(0),
      secure: true,
      sameSite: "None",
    });

    return res.status(200).json({ message: "Logout Successful" });
  } catch (error) {
    console.error("Error logging out", error);
    res.status(500).json({ message: "Error Logging out", error });
  }
};
