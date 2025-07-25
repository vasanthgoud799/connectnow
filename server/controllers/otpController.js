import nodemailer from "nodemailer";

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

const sendOTPEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is: ${otp}. It is valid for 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    console.log("OTP email sent successfully.");
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw new Error("Failed to send OTP email.");
  }
};

const otpStore = new Map();

export const requestOTP = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  const otp = generateOTP();
  const expiryTime = Date.now() + 10 * 60 * 1000;

  otpStore.set(email, { otp, expiryTime });

  try {
    await sendOTPEmail(email, otp);
    res.status(200).json({ message: "OTP sent successfully." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to send OTP.", error: error.message });
  }
};

export const validateOTP = (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required." });
  }

  const otpData = otpStore.get(email);

  if (!otpData) {
    return res.status(400).json({ message: "OTP not requested or expired." });
  }

  const { otp: storedOTP, expiryTime } = otpData;

  if (Date.now() > expiryTime) {
    otpStore.delete(email);
    return res.status(400).json({ message: "OTP has expired." });
  }

  if (storedOTP !== otp) {
    return res.status(400).json({ message: "Invalid OTP." });
  }

  otpStore.delete(email);
  res.status(200).json({ message: "OTP validated successfully." });
};
