/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true, webpack(config) { config.resolve.alias = {...config.resolve.alias, "onnxruntime-node": false, sharp: false}; return config; } };

module.exports = nextConfig;
