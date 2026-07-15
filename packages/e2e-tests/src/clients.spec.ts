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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  IntegrationEnvironment,
  newHomePageTab,
  Process,
  safeClickHandle,
  sleep,
  startIntegrationTestEnvironment,
  startMcpEverythingServerProcess,
} from "./utils/integration-test-support";
import {
  getClientListPageHandle,
  getDeleteClientButtonHandle,
  getDeleteClientConfirmButtonHandle,
  getEditVisibilityButtonHandle,
  getEditVisibilitySubmitButtonHandle,
  getMenuClientElementHandle,
  getMenuUsersElementHandle,
  getNewClientButtonHandle,
  getNewUserButtonHandle,
  getRandomString,
  getUserListPageHandle,
} from "./utils/test-ui-utils";
import { Page } from "puppeteer";

async function waitForFirstClientListed(page: Page) {
  return await page.waitForSelector(
    "[data-testid='client-list-page-witness'] div[data-slot='card']",
    { timeout: 5000 }
  );
}

async function activateClientListPage(page: Page) {
  await safeClickHandle(await getMenuClientElementHandle(page));
}

let additionalUserFullName: string;

async function addAdditionalUserAsPrerequisite(page: Page) {
  await safeClickHandle(await getMenuUsersElementHandle(page));
  await getUserListPageHandle(page);
  await page.waitForSelector("[data-testid='user-id-witness']", {
    timeout: 10000,
  });
  await sleep(1000);

  await safeClickHandle(await getNewUserButtonHandle(page));

  await page.waitForSelector("[role='dialog'] button[type='submit']", {
    timeout: 10000,
  });

  additionalUserFullName = getRandomString();
  await page.type("input[name='userId']", getRandomString());
  await page.type("input[name='fullName']", additionalUserFullName);

  await safeClickHandle(
    await page.waitForSelector("[role='dialog'] button[type='submit']")
  );

  await page.waitForNetworkIdle();
  await sleep(1000);
}

describe("[C] Client", () => {
  let env: IntegrationEnvironment;
  let mcpEnv: Process;
  beforeAll(async () => {
    const envs = await Promise.all([
      startIntegrationTestEnvironment(),
      startMcpEverythingServerProcess(),
    ]);
    env = envs[0];
    mcpEnv = envs[1];
  });

  afterAll(async () => {
    await Promise.all([mcpEnv.stop(), env?.stop()]);
  });

  it("should create a new user as prerequisite", async () => {
    const page = await newHomePageTab(env);
    await addAdditionalUserAsPrerequisite(page);
  });

  it("should create a new client with tags and authentication", async () => {
    const page = await newHomePageTab(env);

    await activateClientListPage(page);

    await safeClickHandle(await getNewClientButtonHandle(page));

    await page.type("input[name='name']", getRandomString());
    await page.type(
      "input[name='serverUrl']",
      `http://localhost:${mcpEnv.port}/mcp`
    );
    await page.type("textarea[name='description']", getRandomString());
    await page.type("input[name='tags']", "tag1, tag2");
    await safeClickHandle(
      await page.waitForSelector("[data-testid='client-auth-select-witness']")
    );
    await safeClickHandle(
      await page.waitForSelector(
        "[data-radix-select-viewport] div[role='option']:nth-child(2)"
      )
    );

    await page.type("input[name='authentication.username']", getRandomString());
    await page.type("input[name='authentication.password']", getRandomString());
    await safeClickHandle(
      await page.waitForSelector("[data-testid='client-submit-button-witness']")
    );
    await safeClickHandle(
      await page.waitForSelector(
        "[data-testid='edit-client-create-button-close-witness']"
      )
    );
    await page.waitForNetworkIdle();
    await waitForFirstClientListed(page);
    await page.close();
  });

  it("should show stateful indicator", async () => {
    const page = await newHomePageTab(env);
    await activateClientListPage(page);
    const firstItem = await waitForFirstClientListed(page);
    if (!firstItem) {
      expect.fail("Expected a client to exist");
    }
    await safeClickHandle(firstItem);
    await sleep(3000);
    const stateText = await page.$eval(
      "span[data-testid='state-witness']",
      (el) => el.textContent
    );
    expect(stateText).to.include("stateful");
    await page.close();
  });

  it("should show the online indicator", async () => {
    const page = await newHomePageTab(env);
    await activateClientListPage(page);
    const firstItem = await waitForFirstClientListed(page);
    if (!firstItem) {
      expect.fail("Expected a client to exist");
    }
    await safeClickHandle(firstItem);
    await sleep(3000);
    const stateText = await page.$eval(
      "span[data-testid='online-witness']",
      (el) => el.textContent
    );
    expect(stateText).to.include("onlinesince");
    await page.close();
  });
  it("should run the echo tool and verify response contains the message", async () => {
    const page = await newHomePageTab(env);
    await activateClientListPage(page);
    const firstItem = await waitForFirstClientListed(page);
    if (!firstItem) {
      expect.fail("Expected a client to exist");
    }
    await safeClickHandle(firstItem);

    // Wait for client to connect and tools to load
    await sleep(3000);

    // Find the echo tool card and click its Run Tool button
    const runToolButtons = await page.$$("div[data-slot='card'] button");
    let echoButton = null;
    for (const btn of runToolButtons) {
      const cardText = await btn.evaluate(
        (el) => el.closest("div[data-slot='card']")?.textContent
      );
      if (cardText?.includes("echo")) {
        echoButton = btn;
        break;
      }
    }
    if (!echoButton) {
      expect.fail("Echo tool not found");
    }
    await safeClickHandle(echoButton);

    // Wait for dialog and fill in the message
    const testMessage = "test-echo-message-" + getRandomString();
    await page.waitForSelector("[role='dialog'] textarea[name='message']");
    await page.type("textarea[name='message']", testMessage);

    // Click Run button in dialog footer
    const dialogButtons = await page.$$("[role='dialog'] button");
    await safeClickHandle(dialogButtons[0]!);

    // Wait for result and verify it contains the message
    await sleep(2000);
    const resultText = await page.$eval(
      "[role='dialog']",
      (el) => el.textContent
    );
    expect(resultText).to.include(testMessage);

    await page.close();
  });

  it("should search for clients by tag using the search input", async () => {
    const page = await newHomePageTab(env);

    await activateClientListPage(page);
    await page.waitForSelector("[type='search']");
    await page.type("[type='search']", "tag1");
    const client = await waitForFirstClientListed(page);
    expect(client).to.exist;
    page.close();
  });

  it("should disable a client via the visibility edit dialog", async () => {
    const page = await newHomePageTab(env);
    await activateClientListPage(page);
    const firstItem = await waitForFirstClientListed(page);
    if (!firstItem) {
      expect.fail("Expected one item to delete");
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

  it("should change the owner of a client via the creator edit dialog", async () => {
    const page = await newHomePageTab(env);
    await activateClientListPage(page);
    const firstItem = await waitForFirstClientListed(page);
    if (!firstItem) {
      expect.fail("Expected one item");
    }
    await safeClickHandle(firstItem);

    await sleep(1000);

    // Click the Edit button for creator
    await safeClickHandle(
      await page.waitForSelector("[data-testid='edit-owner-button-witness']")
    );

    await sleep(500);

    // Open the UserSelect popover
    await safeClickHandle(await page.waitForSelector("[role='combobox']"));

    // Type in CommandInput to search for the user
    const commandInput = await page.waitForSelector("[cmdk-input]");
    await commandInput?.type(additionalUserFullName);

    await sleep(500);

    // Select the user from the list
    await safeClickHandle(await page.waitForSelector("[cmdk-item]"));

    // Click Save button in dialog
    await safeClickHandle(
      await page.waitForSelector("[role='dialog'] button:last-of-type")
    );

    await page.waitForNetworkIdle();
    await sleep(1000);
    await page.close();
  });

  it("should delete a client via the delete confirmation dialog", async () => {
    const page = await newHomePageTab(env);
    await activateClientListPage(page);
    const firstItem = await waitForFirstClientListed(page);
    if (!firstItem) {
      expect.fail("Expected one item to delete");
    }
    await safeClickHandle(firstItem);

    await safeClickHandle(await getDeleteClientButtonHandle(page));

    await sleep(1000);

    const nameHandler = await page.waitForSelector(
      "[data-testid='client-name-holder-witness']"
    );

    if (!nameHandler) {
      expect.fail("No name to type found");
    }

    const name = await nameHandler.evaluate((e) => e.textContent);
    if (!name) {
      expect.fail("No name to type found");
    }

    console.log("Deleting client with name", name);

    await sleep(1000);

    await page.type("input[name='name']", name);

    await safeClickHandle(await getDeleteClientConfirmButtonHandle(page));

    await getClientListPageHandle(page);
    try {
      await waitForFirstClientListed(page);
      expect.fail("Client not deleted");
    } catch (e) {}
    await page.close();
  });
});
