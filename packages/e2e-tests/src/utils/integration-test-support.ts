/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the “Licence”);
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/
import { Db, MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { execa } from "execa";
import getPort from "get-port";
import process from "process";
import puppeteer, { Browser, Page } from "puppeteer";
import { loadEnv } from "vite";
import path from "path";
import { getLoginElementHandle } from "./test-ui-utils";

export type Process = {
  port: number;
  mockDatabase: Db | undefined;
  stop(): Promise<void>;
};

export interface IntegrationEnvironment {
  browser: Browser;
  page: Page;
  navigate: (path: string, page?: Page) => Promise<Page>;
  stop: () => Promise<void>;
}

export async function startA2AAgentSampleProcess() {
  const port = await getPort();

  const server = execa("npx", ["tsx", "src/a2a-sample/server.ts"], {
    env: {
      PORT: port.toString(),
    },
  });

  return await new Promise<Process>((resolve, reject) => {
    server.catch((error) => reject(error));

    if (server.stdout === null) return reject("Failed to start MCP server.");
    let returned = false;
    const portStr = port.toString();
    server.stdout.on("data", (stream: Buffer) => {
      const line = stream.toString();
      console.log(line);
      if (!returned && line.includes(portStr)) {
        returned = true;
        return resolve({
          stop: async () => {
            if (server.killed) return;
            server.kill();
          },
          port,
          mockDatabase: undefined,
        });
      }
    });
    server.stderr.on("data", (data: Buffer) => {
      console.log(data.toString());
    });
  });
}

export async function startMcpEverythingServerProcess() {
  const port = await getPort();

  const server = execa(
    "npx",
    ["-y", "@modelcontextprotocol/server-everything", "streamableHttp"],
    {
      env: {
        PORT: port.toString(),
      },
    }
  );

  return await new Promise<Process>((resolve, reject) => {
    server.catch((error) => reject(error));

    if (server.stdout === null) return reject("Failed to start MCP server.");
    let returned = false;
    const portStr = port.toString();
    server.stderr.on("data", (stream: Buffer) => {
      const line = stream.toString();
      console.log(line);
      if (!returned && line.includes(portStr)) {
        returned = true;
        return resolve({
          stop: async () => {
            if (server.killed) return;
            server.kill();
          },
          port,
          mockDatabase: undefined,
        });
      }
    });
    server.stdout.on("data", (data: Buffer) => {
      console.log(data.toString());
    });
  });
}

async function startServerProcess() {
  const port = await getPort();
  const mongodbPort = await getPort();

  const mockServer = await MongoMemoryServer.create({
    instance: { port: mongodbPort },
  });

  const mongoUri = mockServer.getUri();
  const mockClient = new MongoClient(mongoUri);
  await mockClient.connect();
  const mockDatabase = mockClient.db();

  const server = execa("npm", ["run", "e2e"], {
    cwd: path.join(process.env.INIT_CWD!, "..", "server"),
    env: {
      NODE_ENV: "e2e",
      SERVER_PORT: port.toString(),
      API_URL: "http://localhost:" + port.toString(),
      DB_URI: mongoUri,
      OIDC_ENABLED: "false",
      OIDC_USE_IDENTITY_PROPAGATION_SERVICE: "false",
      AUTHENTICATION_PLUGIN: "",
    },
  });

  return await new Promise<Process>((resolve, reject) => {
    server.catch((error) => reject(error));

    if (server.stdout === null) return reject("Failed to start server.");
    let returned = false;
    server.stdout.on("data", (stream: Buffer) => {
      console.log(stream.toString());
      if (!returned && stream.toString().includes(port.toString())) {
        returned = true;
        return resolve({
          stop: async () => {
            if (server.killed) return;
            server.kill();
            await mockServer.stop();
          },
          port,
          mockDatabase,
        });
      }
    });
    server.stderr.on("data", (data: Buffer) => {
      console.log(data.toString());
    });
  });
}

async function startViteProcess(serverPort: number) {
  const port = await getPort();

  const server = execa("npm", ["run", "e2e"], {
    cwd: path.join(process.env.INIT_CWD!, "..", "client"),
    env: {
      NODE_ENV: "e2e",
      PORT: port.toString(),
      BASE_URL: `http://localhost:${port}`,
      API_URL: `http://localhost:${serverPort}`,
      SERVER_PORT: serverPort.toString(),
    },
  });

  return await new Promise<Process>((resolve, reject) => {
    server.catch((error) => reject(error));

    if (server.stdout === null) return reject("Failed to start server.");
    let returned = false;
    server.stdout.on("data", (stream: Buffer) => {
      // console.log(stream.toString());
      if (!returned && stream.toString().includes(port.toString())) {
        returned = true;
        return resolve({
          stop: async () => {
            if (server.killed) return;
            server.kill();
          },
          port,
          mockDatabase: undefined,
        });
      }
    });
    server.stderr.on("data", (data: Buffer) => {
      console.log(data.toString());
    });
  });
}

async function openBrowser(port: number) {
  const env = loadEnv("e2e", process.cwd(), "");
  const proxy = env.http_proxy;
  const args = ["--no-sandbox", "--ignore-certificate-errors"];

  let proxyUrl: URL | undefined;

  if (proxy) {
    proxyUrl = new URL(proxy);
    const chromeProxy = proxyUrl.hostname + ":" + proxyUrl.port;
    args.push(`--proxy-server=${chromeProxy}`);
    args.push(`--proxy-bypass-list=${env.no_proxy || ""}`);
  }
  // console.log(args);

  const browser = await puppeteer.launch({
    browser: "chrome",
    args: args,
    headless: false,
  });

  const page = await browser.newPage();
  if (proxyUrl) {
    await page.authenticate({
      username: proxyUrl.username,
      password: proxyUrl.password,
    });
  }

  if (!env.USER) {
    throw Error("No env USER variable found");
  }

  await page.goto(`http://localhost:${port}/`);
  await page.waitForNetworkIdle();
  let loginHandle = await getLoginElementHandle(page);
  await safeClickHandle(loginHandle); //fist click don't work!

  console.log("click1");
  await page.waitForNetworkIdle();

  // if (!env.ECAS_PASSWORD) {
  //   throw Error("No env ECAS_PASSWORD variable found");
  // }
  //
  // START ECAS AUTHENTICATION
  //
  // await page.goto(remoteUrl, { waitUntil: "networkidle0" });
  // await page.type("#username", env.USER);
  // await page.click('button[name="whoamiSubmit"]');
  // await page.waitForNetworkIdle();
  // await page.type("#password", env.ECAS_PASSWORD);
  // await page.click("#verif-method-dd-id");
  // await page.click("#verif-method-dd-PASSWORD");
  // await page.click('input[type="submit"]');
  // await page.waitForNetworkIdle();
  // await page.goto(remoteUrl, { waitUntil: "networkidle0" });
  // const cookies = await browser.cookies();
  // const cookie = cookies.find((e) => e.name === "NGXCAS");
  // if (!cookie) {
  //   throw Error("Unable to fetch auth cookie");
  // }
  //
  // await page.goto("http://localhost:" + port, { waitUntil: "networkidle0" });
  // await page.type("#cookie", cookie.value);
  // await page.click("#set-cookie-button");

  return { browser, page };
}

export async function startIntegrationTestEnvironment(): Promise<IntegrationEnvironment> {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const serverProcess = await startServerProcess();
  const viteProcess = await startViteProcess(serverProcess.port);
  const { browser, page } = await openBrowser(viteProcess.port);
  return {
    browser,
    page,
    async navigate(path: string, tabPage?: Page) {
      const url = new URL(path, `http://localhost:${viteProcess.port}/`);
      const urlStr = url.toString();
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(urlStr, [
        "clipboard-read",
        "clipboard-write",
        "clipboard-sanitized-write",
      ]);
      const p = tabPage || page;
      await p.goto(urlStr, { waitUntil: "networkidle0" });
      return p;
    },
    async stop() {
      await browser.close();
      await viteProcess.stop();
      await serverProcess.stop();
    },
  };
}

export async function sendChatMessage(page: Page, text: string) {
  await page.waitForSelector("[data-testid='prompt-input-witness']");
  await page.focus("[data-testid='prompt-input-witness']");
  await page.type("[data-testid='prompt-input-witness']", text);
  await page.click('button[data-testid="submit-witness"]');
  await page.waitForNetworkIdle();
}

export async function getClipboardContent(page: Page) {
  const clipboardContent = await page.evaluate(async () => {
    const text = navigator.clipboard.readText();
    return text;
  });
  return clipboardContent;
}

export async function safeClickHandle(
  elem: Awaited<ReturnType<Page["waitForSelector"]>>
) {
  let tagName = await elem?.evaluate((e) => e.localName);
  tagName = tagName?.toLowerCase();
  if (tagName === "a") {
    await elem?.evaluate((e) => (e as HTMLElement).click());
  } else {
    await elem?.click();
  }
  return elem;
}

export async function safeClickSelector(
  page: Page,
  selector: string,
  usePageClick = false
) {
  const elem = await page.waitForSelector(selector);
  if (usePageClick === false) {
    await safeClickHandle(elem);
  } else {
    await page.click(selector);
  }
  return elem;
}

export async function newHomePageTab(env: IntegrationEnvironment) {
  const page = await env.navigate("/", await env.browser.newPage());
  return page;
}

export async function sleep(timeout: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}
