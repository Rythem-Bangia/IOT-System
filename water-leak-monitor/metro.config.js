const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Keep unit tests out of the bundle if anything ever resolves them by mistake.
const blockList = config.resolver.blockList;
const blockListArr = Array.isArray(blockList)
  ? blockList
  : blockList != null
    ? [blockList]
    : [];
config.resolver.blockList = [...blockListArr, /[/\\].*\.test\.ts$/];

module.exports = withNativeWind(config, { input: "./global.css" });
