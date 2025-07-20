import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const token =
    req.cookies.jwt || req.header("Authorization")?.replace("Bearer ", "");
  // console.log("Retrieved token:", token); // Debugging line

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access Denied: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_KEY);
    req.userId = decoded.userId; // Attach the userId to the request object
    next();
  } catch (err) {
    console.error("Error verifying token:", err);
    res.status(400).json({ message: "Invalid token" });
  }
};
