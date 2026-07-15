import path from "path";
import { Configuration } from "webpack";

const configs: Configuration[] = [
  {
    mode: "production",
    devtool: "source-map",
    target: "node",
    entry: "./src/server-plugin.ts",
    experiments: { outputModule: true },
    ignoreWarnings: [
      { module: /node_modules\/mongodb/ },
      { module: /node_modules\/pg/ },
      { module: /node_modules\/express/ },
      { message: /Critical dependency/ },
    ],
    output: {
      path: path.resolve(__dirname, "./lib"),
      filename: "server-plugin.js",
      libraryTarget: "module",
      module: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
      extensionAlias: {
        ".js": [".ts", ".js"],
      },
      modules: ["node_modules"],
      alias: {
        "@aloha-repositories": path.resolve(
          __dirname,
          "../../packages/server/src/database/repositories/interfaces/"
        ),
        "@aloha-plugins": path.resolve(
          __dirname,
          "../../packages/server/src/plugins/"
        ),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "esbuild-loader",
          options: { target: "es2020" },
        },
      ],
    },
  },
  {
    mode: "production",
    devtool: "source-map",
    target: "web",
    entry: "./src/browser-plugin.tsx",
    experiments: { outputModule: true },
    output: {
      path: path.resolve(__dirname, "./lib"),
      filename: "browser-plugin.js",
      libraryTarget: "module",
      module: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
      modules: ["node_modules"],
      alias: {
        "@aloha-ui-plugins": path.resolve(
          __dirname,
          "../../packages/client/src/plugins/"
        ),
        "@aloha-ui-components": path.resolve(
          __dirname,
          "../../packages/client/src/components/"
        ),
        "@aloha-ui-lib": path.resolve(
          __dirname,
          "../../packages/client/src/lib/"
        ),
        "@/lib": path.resolve(
          __dirname,
          "../../packages/client/src/lib/"
        ),
        "react$": path.resolve(__dirname, "./src/shims/react.js"),
        "react/jsx-runtime$": path.resolve(__dirname, "./src/shims/react-jsx-runtime.js"),
        "react/jsx-dev-runtime$": path.resolve(__dirname, "./src/shims/react-jsx-runtime.js"),
        "react-dom$": path.resolve(__dirname, "./src/shims/react-dom.js"),
        "sonner$": path.resolve(__dirname, "./src/shims/sonner.js"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "esbuild-loader",
          options: { target: "es2020", jsx: "automatic" },
        },
        {
          test: /\.css$/,
          use: [
            "style-loader",
            "css-loader",
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  plugins: [["@tailwindcss/postcss"]],
                },
              },
            },
          ],
        },
      ],
    },
  },
];

export default configs;
