/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "prettier",
  ],
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      env: { node: true },
    },
  ],
  globals: {
    shopify: "readonly"
  },
};
