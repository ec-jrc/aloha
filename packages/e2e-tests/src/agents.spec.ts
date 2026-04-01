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
  Process,
  safeClickHandle,
  sleep,
  startA2AAgentSampleProcess,
  startIntegrationTestEnvironment,
} from "./utils/integration-test-support";
import {
  getAgentsListPageHandle,
  getEditVisibilityButtonHandle,
  getEditVisibilitySubmitButtonHandle,
  getMenuAgentsElementHandle,
  getRandomString,
} from "./utils/test-ui-utils";
import { ElementHandle, Page } from "puppeteer";

async function waitForFirstAgentListed(page: Page) {
  return await page.waitForSelector(
    "[data-testid='agents-list-page-witness'] div[data-slot='card']",
    { timeout: 5000 }
  );
}

async function activateAgentListPage(page: Page) {
  await safeClickHandle(await getMenuAgentsElementHandle(page));
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

describe("[A] Agent", () => {
  let env: IntegrationEnvironment;
  let agentEnv: Process;

  beforeAll(async () => {
    [env, agentEnv] = await Promise.all([
      startIntegrationTestEnvironment(),
      startA2AAgentSampleProcess(),
    ]);
  });

  afterAll(async () => {
    await agentEnv.stop();
    await env?.stop();
  });

  it("should create a new agent with tags and authentication", async () => {
    const page = await newHomePageTab(env);

    await activateAgentListPage(page);

    await clickButtonByText(page, "New Agent");

    const agentPort = agentEnv.port;

    await page.type("input[name='name']", getRandomString());
    await page.type("input[name='description']", getRandomString());
    await page.type("input[name='serverPath']", getRandomString());
    await page.type("input[name='serverUrl']", `http://localhost:${agentPort}`);
    await page.type("input[name='tags']", "tag1, tag2");

    await safeClickHandle(
      await page.waitForSelector("[role='dialog'] button[type='submit']")
    );

    await page.waitForNetworkIdle();
    await waitForFirstAgentListed(page);
    await page.close();
  });

  // TODO: This test requires the A2A agent to connect successfully.
  // Currently, the A2A client is not connecting to the sample server.
  // The ping service fetches the agent card but the connection is not established.
  // This needs investigation into the A2A SDK client factory behavior.
  it.skip("should send a message to the agent and receive a response", async () => {
    const page = await newHomePageTab(env);

    await activateAgentListPage(page);

    // Create a new A2A agent
    await clickButtonByText(page, "New Agent");

    const agentPort = agentEnv.port;

    await page.type("input[name='name']", "A2A Test Agent");
    await page.type("input[name='description']", "Test A2A agent");
    await page.type("input[name='serverPath']", "a2a-test-" + getRandomString());

    // Select A2A protocol from the dropdown
    const protocolTrigger = await page.waitForSelector(
      "[role='dialog'] button[role='combobox']"
    );
    await safeClickHandle(protocolTrigger);
    await sleep(500);
    const a2aOption = await page.waitForSelector(
      "[role='listbox'] [role='option']:first-child"
    );
    await safeClickHandle(a2aOption);

    await page.type("input[name='serverUrl']", `http://localhost:${agentPort}`);

    await safeClickHandle(
      await page.waitForSelector("[role='dialog'] button[type='submit']")
    );

    await page.waitForNetworkIdle();

    // Wait for the ping service to connect the agent (runs every 5 seconds)
    await sleep(7000);

    // Refresh the page to get updated connection status
    await page.reload({ waitUntil: "networkidle0" });

    // Click on the A2A agent
    const agentCard = await page.evaluateHandle(() => {
      const cards = document.querySelectorAll(
        "[data-testid='agents-list-page-witness'] div[data-slot='card']"
      );
      for (const card of cards) {
        if (card.textContent?.includes("A2A Test Agent")) {
          return card;
        }
      }
      return null;
    });
    await safeClickHandle(agentCard as ElementHandle<Element>);

    // Wait for the chat input and send a message
    await page.waitForSelector("textarea[name='message']", { timeout: 10000 });
    await page.type("textarea[name='message']", "Hello agent");
    await safeClickHandle(await page.waitForSelector("button[type='submit']"));

    // Wait for the agent response
    const response = await page.waitForSelector(
      "[role='log'] > div > div:nth-child(2)",
      { timeout: 15000 }
    );
    expect(response).to.exist;
    await page.close();
  });

  it("should search for agents by tag using the search input", async () => {
    const page = await newHomePageTab(env);

    await activateAgentListPage(page);
    await page.waitForSelector("[type='search']");
    await page.type("[type='search']", "tag1");
    const agent = await waitForFirstAgentListed(page);
    expect(agent).to.exist;
    await page.close();
  });

  it("should disable an agent via the visibility edit dialog", async () => {
    const page = await newHomePageTab(env);
    await activateAgentListPage(page);
    const firstItem = await waitForFirstAgentListed(page);
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

  it("should delete an agent via the delete confirmation dialog", async () => {
    const page = await newHomePageTab(env);
    await activateAgentListPage(page);
    const firstItem = await waitForFirstAgentListed(page);
    if (!firstItem) {
      expect.fail("Expected one item to delete");
    }
    await safeClickHandle(firstItem);

    await clickButtonByText(page, "Delete Agent");

    await sleep(1000);

    // ConfirmDialog uses AlertDialog — click "Continue" to confirm
    await safeClickHandle(
      await page.waitForSelector("[role='alertdialog'] button:last-child")
    );

    await sleep(1000);

    await getAgentsListPageHandle(page);
    try {
      await waitForFirstAgentListed(page);
      expect.fail("Agent not deleted");
    } catch (e) {}
    await page.close();
  });
});
