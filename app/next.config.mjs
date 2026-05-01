/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use static export so we can serve from any host (Vercel, Netlify, S3).
  // The pipeline writes JSON into public/data/, which is bundled into the build.
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
