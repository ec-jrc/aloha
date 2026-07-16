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

import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import PageTitle from "@/components/page-title";
import { ChangelogVersion, getChangelog } from "@/services/hub";

export default function ChangelogPage() {
  const [changelogContent, setChangelogContent] = useState<
    ChangelogVersion[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    async function fetchChangelog() {
      try {
        const log = await getChangelog();
        setChangelogContent(log);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    void fetchChangelog();
  }, [location]);

  if (loading) {
    return <div>Loading changelog...</div>;
  }

  if (error) {
    return <div>Error loading changelog: {error}</div>;
  }

  return (
    <div className="" data-testid="changelog-page-witness">
      <PageTitle>Changelog</PageTitle>
      {changelogContent?.map((c, i) => (
        <div key={c.version} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
            <h2 className="text-xl font-semibold text-gray-900">
              v{c.version}
            </h2>
            {i === 0 && (
              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                Latest
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mb-4">{c.date}</p>
          <div className="my-2 ml-6">
            {c.sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-md font-semibold text-gray-700 mt-3 mb-1">
                  {section.title}
                </h3>
                {section.items.map((item, index) => (
                  <li key={index} className="list-none">
                    <span className="text-gray-500 mr-4">•</span>
                    {item}
                  </li>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
