const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("mjs");

// Supabase deps that don't exist in React Native env — mock them
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@opentelemetry/api": require.resolve("./src/empty-module.js"),
  "expo-local-authentication": require.resolve("./src/empty-module.js"),
  "expo-haptics": require.resolve("./src/empty-module.js"),
};

module.exports = config;
