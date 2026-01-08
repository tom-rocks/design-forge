const { merge } = require("webpack-merge");
const singleSpaDefaults = require("webpack-config-single-spa-react");
const webpack = require("webpack");

module.exports = (webpackConfigEnv, argv) => {
  // Determine if we should output SystemJS based on environment
  const isProduction = argv.mode === "production";
  const outputSystemJS = isProduction;

  const defaultConfig = singleSpaDefaults({
    orgName: "pw",
    projectName: "app",
    webpackConfigEnv,
    argv,
    outputSystemJS,
  });

  // Only clear externals for production builds
  if (isProduction) {
    defaultConfig.externals = [];
  }

  // Design Forge WebSocket URL - update this to your Railway URL
  const designForgeWs = process.env.DESIGN_FORGE_WS || 
    (isProduction 
      ? "wss://design-forge-production.up.railway.app/ws/bridge"
      : "ws://localhost:3001/ws/bridge");

  return merge(defaultConfig, {
    output: {
      filename: "index.js",
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env.DESIGN_FORGE_WS": JSON.stringify(designForgeWs),
      }),
    ],
  });
};
