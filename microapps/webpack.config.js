const { merge } = require("webpack-merge");
const singleSpaDefaults = require("webpack-config-single-spa-react");

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

  return merge(defaultConfig, {
    // modify the webpack config however you'd like to by adding to this object
    output: {
      filename: "index.js",
    },
  });
};
