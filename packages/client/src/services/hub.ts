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

import { endpoints_schemas } from "aloha-shared";
import { customFetch, safeParseWithErrors } from "./utils";

const apiBaseUrl = "/api/hub";

export async function getHubStatus() {
  const response = await customFetch("Get Hub Status", `${apiBaseUrl}/`);
  const obj = await response.json();
  return safeParseWithErrors(obj, endpoints_schemas.HubStatusSchema);
}

export async function restartHub() {
  await customFetch("Restart Hub", `${apiBaseUrl}/restart`, {
    method: "POST",
  });
}

export interface ChangelogSection {
  title: string;
  items: string[];
}

export interface ChangelogVersion {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

export async function getChangelog(): Promise<ChangelogVersion[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/changelog`);
    if (!response.ok) {
      throw new Error(`Failed to fetch changelog: ${response.statusText}`);
    }

    const text = await response.text();
    return parseChangelogText(text);
  } catch (error) {
    console.error("Error parsing changelog:", error);
    return [];
  }
}

export function parseChangelogText(changelogText: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = [];

  // Split by version sections (assuming format ## [version] - date)
  const versionSections = changelogText.split(/## \[(.*?)\] - (.*?)\n/);

  // Remove the first element which is everything before the first version
  versionSections.shift();

  // Process pairs of (version, date) and content
  for (let i = 0; i < versionSections.length; i += 3) {
    if (i + 1 >= versionSections.length) break;

    const version = versionSections[i];
    const date = versionSections[i + 1];
    const content = versionSections[i + 2]?.trim() || "";

    if (version && date) {
      const sections: ChangelogSection[] = [];
      const lines = content.split("\n");

      for (const line of lines) {
        if (line.startsWith("### ")) {
          sections.push({ title: line.replace("### ", ""), items: [] });
        } else if (line.startsWith("- ") && sections.length > 0) {
          sections[sections.length - 1].items.push(line.replace("- ", ""));
        }
      }

      versions.push({ version, date, sections });
    }
  }

  return versions;
}
