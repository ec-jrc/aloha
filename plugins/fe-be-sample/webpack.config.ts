import path from "path";
import { Configuration } from "webpack";

const configs: Configuration[] = [
  {
    mode: "production",
    devtool: "source-map",
    target: "node",
    entry: "./src/server-plugin.ts",
    experiments: { outputModule: true },
    output: {
      path: path.resolve(__dirname, "./lib"),
      filename: "server-plugin.js",
      libraryTarget: "module",
      module: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
      modules: ["node_modules"],
      alias: {
        "@aloha-plugins": path.resolve(__dirname, "../../packages/server/src/plugins/"),
      },
    },
    module: {
      rules: [{ test: /\.tsx?$/, loader: "esbuild-loader", options: { target: "es2020" } }],
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
        "@aloha-plugins": path.resolve(__dirname, "../../packages/server/src/plugins/"),
      },
    },
    module: {
      rules: [
        { test: /\.tsx?$/, loader: "esbuild-loader", options: { target: "es2020", jsx: "automatic" } },
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
