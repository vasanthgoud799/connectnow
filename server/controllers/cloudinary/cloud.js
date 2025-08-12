import cloudinary from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

cloudinary.v2.config({
  cloud_name: "dc9rkmeei",
  api_key: "134653198625169",
  api_secret: "<your_api_secret>", // Replace with your actual API secret
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: "profile_images", // Folder name in Cloudinary
    allowed_formats: ["jpeg", "png", "jpg"], // Allowed file formats
    public_id: (req, file) => Date.now() + "-" + file.originalname, // Custom file name
  },
});

const upload = multer({ storage });

export default upload;
