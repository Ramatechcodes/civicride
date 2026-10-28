import cloudinaryPkg from 'cloudinary';

// cloudinary is a CommonJS package; the default import exposes its `v2` API in ESM.
const cloudinary = cloudinaryPkg.v2;

export function cloudinaryReady() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

// Configure on every call so the values are always read after dotenv has loaded.
export function getCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
  return cloudinary;
}

export default cloudinary;
