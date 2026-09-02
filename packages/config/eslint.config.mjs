// Shared flat ESLint config for non-Next packages in the Kaido monorepo
// (the `web` app extends `eslint-config-next` separately and re-uses these
// ignore globs). Keep deliberately small — CI runs `turbo run lint`.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      // generated TS contract bindings — linted output, not source
      "packages/contract-bindings/src/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
