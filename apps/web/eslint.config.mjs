import config from "@myakiba/eslint-config/base";

export default [
  ...config,
  {
    ignores: ["dist/**"],
  },
];
