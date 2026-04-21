import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist", "node_modules", "src-tauri/target", "src-tauri/gen", "coverage"],
  },
  js.configs.recommended,
  {
    files: ["*.config.ts", "*.config.js"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      globals: {
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        navigator: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        ClipboardEvent: "readonly",
        DataTransfer: "readonly",
        HTMLElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLHeadingElement: "readonly",
        HTMLSpanElement: "readonly",
        HTMLTextAreaElement: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        Response: "readonly",
        Event: "readonly",
        BodyInit: "readonly",
        Uint8Array: "readonly",
        ArrayBuffer: "readonly",
        Promise: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Element: "readonly",
        ResizeObserver: "readonly",
        globalThis: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: { react: { version: "detect" } },
    rules: {
      // Disable base rule in favor of the TS-aware one below (base doesn't
      // understand parameter-name-in-type-signature positions).
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
