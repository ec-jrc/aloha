/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the "Licence");
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  IntegrationEnvironment,
  newHomePageTab,
  safeClickHandle,
  sleep,
  startIntegrationTestEnvironment,
  startMcpEverythingServerProcess,
} from "./utils/integration-test-support";
import {
  getEditVisibilityButtonHandle,
  getEditVisibilitySubmitButtonHandle,
  getMenuServersElementHandle,
  getRandomString,
  getServerListPageHandle,
} from "./utils/test-ui-utils";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { ElementHandle, Page } from "puppeteer";

async function waitForFirstServerListed(page: Page) {
  return await page.waitForSelector(
    "[data-testid='server-list-page-witness'] div[data-slot='card']",
    { timeout: 5000 }
  );
}

async function activateServerListPage(page: Page) {
  await safeClickHandle(await getMenuServersElementHandle(page));
}

async function clickButtonByText(page: Page, text: string) {
  const btn = await page.waitForFunction(
    (t) => {
      const buttons = document.querySelectorAll("button");
      for (const b of Array.from(buttons)) {
        if (b.textContent?.includes(t)) return b;
      }
      return null;
    },
    { timeout: 5000 },
    text
  );
  if (!btn) {
    throw Error("No button found");
  }
  await safeClickHandle(btn as ElementHandle<HTMLButtonElement>);
}

describe("[S] Server", () => {
  let env: IntegrationEnvironment;
  beforeAll(async () => {
    env = await startIntegrationTestEnvironment();
  });

  afterAll(async () => await env?.stop());

  it("should create a new server with tags", async () => {
    const page = await newHomePageTab(env);

    await activateServerListPage(page);

    await clickButtonByText(page, "New Server");

    await page.type("input[name='name']", getRandomString());
    await page.type("input[name='description']", getRandomString());
    await page.type("input[name='serverPath']", getRandomString());
    await page.type("input[name='tags']", "tag1, tag2");

    await safeClickHandle(
      await page.waitForSelector("[role='dialog'] button[type='submit']")
    );

    await page.waitForNetworkIdle();
    await waitForFirstServerListed(page);
    await page.close();
  });

  it("should expose mcp and hub endpoint", async () => {
    // 0. Start the MCP everything server
    const mcpEverything = await startMcpEverythingServerProcess();

    try {
      const baseUrl = `http://localhost:${env.serverPort}`;

      // Login to get a session cookie
      const loginRes = await fetch(`${baseUrl}/api/login`, {
        redirect: "manual",
      });
      const setCookie = loginRes.headers.get("set-cookie");
      const cookie = setCookie?.split(";")[0] ?? "";
      const headers = { "Content-Type": "application/json", Cookie: cookie };

      // Create a client pointing to the everything server
      const clientRes = await fetch(`${baseUrl}/api/client/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "test-client-" + getRandomString(),
          serverUrl: `http://localhost:${mcpEverything.port}/mcp`,
          serverProtocol: "http",
          type: "client",
          authentication: { type: "none" },
          visibility: "public",
          creator: "no-auth-user",
        }),
      });
      expect(clientRes.ok).toBe(true);
      // Client creation returns SSE stream; parse it to extract the client id
      const clientSseText = await clientRes.text();
      const clientIdMatch = clientSseText.match(/"id"\s*:\s*"([^"]+)"/);
      expect(clientIdMatch).not.toBeNull();
      const clientId = clientIdMatch![1]!;

      // Wait for the client to connect
      await sleep(3000);

      // Create a server with a serverPath
      const serverPath = "testsvr" + getRandomString(6);
      const serverName = "test-server-" + getRandomString();
      const serverRes = await fetch(`${baseUrl}/api/server/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: serverName,
          serverPath,
          type: "server",
          visibility: "public",
          creator: "no-auth-user",
        }),
      });
      expect(serverRes.status).toBe(204);

      // Fetch the server list to get the created server's ID
      const serverListRes = await fetch(`${baseUrl}/api/server/`, { headers });
      const servers = (await serverListRes.json()) as Array<{
        id: string;
        serverPath: string;
      }>;
      const server = servers.find((s) => s.serverPath === serverPath);
      expect(server).toBeDefined();

      // Connect the client to the server
      const connectRes = await fetch(
        `${baseUrl}/api/server/${server!.id}/_connect/${clientId}`,
        { method: "POST", headers }
      );
      expect(connectRes.status).toBe(204);

      // 1. Create a project and token
      const projectId = "proj" + getRandomString(6);
      const projRes = await fetch(`${baseUrl}/api/project/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId,
          name: "Test Project",
          description: "test",
        }),
      });
      expect(projRes.ok).toBe(true);

      const tokenRes = await fetch(`${baseUrl}/api/token/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          project: projectId,
          expirationDate: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        }),
      });
      expect(tokenRes.ok).toBe(true);
      const { token } = (await tokenRes.json()) as { token: string };

      // 2. Connect to both endpoints using the MCP SDK client
      const mcpUrl = `${baseUrl}/api/mcp/${serverPath}/mcp`;
      const hubUrl = `${baseUrl}/api/mcp/${serverPath}/hub`;

      const mcpClient = new Client(
        { name: "test-mcp-client", version: "1.0.0" },
        { capabilities: {} }
      );
      const mcpTransport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      });
      await mcpClient.connect(mcpTransport as Parameters<typeof mcpClient.connect>[0]);

      const hubClient = new Client(
        { name: "test-hub-client", version: "1.0.0" },
        { capabilities: {} }
      );
      const hubTransport = new StreamableHTTPClientTransport(new URL(hubUrl), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      });
      await hubClient.connect(hubTransport as Parameters<typeof hubClient.connect>[0]);

      // 3. Check the tools available
      const mcpTools = await mcpClient.listTools();
      expect(mcpTools.tools.length).toBeGreaterThan(2);

      const hubTools = await hubClient.listTools();
      expect(hubTools.tools.length).toBe(2);
      expect(hubTools.tools.map((t) => t.name).sort()).toEqual([
        "discover_tools",
        "invoke_tool",
      ]);

      // 4. Test the /hub endpoint
      // Call discover_tools and search for *
      const discoverResult = await hubClient.callTool({
        name: "discover_tools",
        arguments: { query: "*" },
      });
      const discoverText = (
        discoverResult.content as Array<{ type: string; text: string }>
      )[0]!.text;
      const discoverContent = JSON.parse(discoverText) as {
        tools: Array<{ tool: { name: string } }>;
        total: number;
      };
      expect(discoverContent.total).toBeGreaterThan(0);

      // Use invoke_tool to call the first tool returned
      const firstTool = discoverContent.tools[0]!.tool.name;
      const invokeResult = await hubClient.callTool({
        name: "invoke_tool",
        arguments: { toolId: firstTool, arguments: {} },
      });
      expect(invokeResult.content).toBeDefined();

      // 5. Discover the get-env tool and call it
      const discoverEnvResult = await hubClient.callTool({
        name: "discover_tools",
        arguments: { query: "get-env" },
      });
      const discoverEnvText = (
        discoverEnvResult.content as Array<{ type: string; text: string }>
      )[0]!.text;
      const discoverEnvContent = JSON.parse(discoverEnvText) as {
        tools: Array<{ tool: { name: string } }>;
        total: number;
      };
      expect(discoverEnvContent.total).toBeGreaterThan(0);
      const getEnvToolId = discoverEnvContent.tools[0]!.tool.name;
      expect(getEnvToolId).toContain("get-env");

      const getEnvResult = await hubClient.callTool({
        name: "invoke_tool",
        arguments: { toolId: getEnvToolId, arguments: {} },
      });
      const getEnvContent = getEnvResult.content as Array<{
        type: string;
        text: string;
      }>;
      expect(getEnvContent[0]!.text).toBeDefined();

      // Cleanup
      await mcpClient.close();
      await hubClient.close();
    } finally {
      await mcpEverything.stop();
    }
  });

  it("should search for servers by tag using the search input", async () => {
    const page = await newHomePageTab(env);

    await activateServerListPage(page);
    await page.waitForSelector("[type='search']");
    await page.type("[type='search']", "tag1");
    const server = await waitForFirstServerListed(page);
    expect(server).to.exist;
    await page.close();
  });

  it("should disable a server via the visibility edit dialog", async () => {
    const page = await newHomePageTab(env);
    await activateServerListPage(page);
    const firstItem = await waitForFirstServerListed(page);
    if (!firstItem) {
      expect.fail("Expected one item");
    }
    await safeClickHandle(firstItem);

    await safeClickHandle(await getEditVisibilityButtonHandle(page));

    await safeClickHandle(await page.waitForSelector("[role='switch']"));

    await safeClickHandle(await getEditVisibilitySubmitButtonHandle(page));

    await sleep(3000);

    const status = await (
      await page.waitForSelector("[data-testid='visibility-disabled-witness']")
    )?.evaluate((e) => e.textContent);

    expect(status).equals("Disabled");

    await page.close();
  });

  it("should delete a server via the delete confirmation dialog", async () => {
    const page = await newHomePageTab(env);
    await activateServerListPage(page);
    const firstItem = await waitForFirstServerListed(page);
    if (!firstItem) {
      expect.fail("Expected one item to delete");
    }
    await safeClickHandle(firstItem);

    await clickButtonByText(page, "Delete Server");

    await sleep(1000);

    await safeClickHandle(
      await page.waitForSelector("[role='alertdialog'] button:last-child")
    );

    await sleep(1000);

    await getServerListPageHandle(page);
    try {
      await waitForFirstServerListed(page);
      expect.fail("Server not deleted");
    } catch (e) {}
    await page.close();
  });
});
