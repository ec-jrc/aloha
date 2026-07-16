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

import { Link, NavLink } from "react-router";
import {
  ComputerDesktopIcon,
  HomeIcon,
  RectangleStackIcon,
  ServerStackIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";
import { ReactNode, useContext, useEffect, useState } from "react";
import { TagIcon } from "@heroicons/react/24/outline";
import { BotIcon } from "lucide-react";
import { UserContext } from "@/context/contexes";
import { getChangelog } from "@/services/hub";

function CoolNavLink({
  to,
  end,
  icon,
  linkText,
  alwaysActive = false,
  dataTestid,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  linkText: string;
  alwaysActive?: boolean;
  dataTestid: string;
}) {
  const user = useContext(UserContext);
  if (!user && !alwaysActive) {
    return (
      <div
        className="flex flex-col items-center my-2 ml-2 p-2 text-gray-500 "
        data-testid={dataTestid}
      >
        <span className="block">{icon}</span>
        <span className="block text-xs">{linkText}</span>
      </div>
    );
  }
  return (
    <NavLink
      to={to}
      end={end}
      data-testid={dataTestid}
      className={({ isActive }) =>
        "flex flex-col items-center my-2 ml-2 p-2 " +
        (isActive ? " bg-slate-100 text-slate-900 rounded-l" : "")
      }
    >
      <span className="block">{icon}</span>
      <span className="block text-xs">{linkText}</span>
    </NavLink>
  );
}

export default function Menu() {
  const [latestVersion, setLatestVersion] = useState("-");

  function getYear() {
    return new Date().getFullYear();
  }

  useEffect(() => {
    async function fetchLatestVersion() {
      try {
        const versions = await getChangelog();
        if (versions.length > 0) {
          setLatestVersion(`v${versions[0].version}`);
        }
      } catch (error) {
        console.error("Error fetching latest version:", error);
      }
    }

    void fetchLatestVersion();
  }, []);

  return (
    <nav className="flex flex-col text-slate-200 py-2 min-w-28 overflow-y-auto relative">
      <CoolNavLink
        dataTestid="nav-home-button-witness"
        to="/"
        end
        icon={<HomeIcon className="size-6" />}
        linkText="Home"
        alwaysActive={true}
      />
      <CoolNavLink
        dataTestid="nav-clients-button-witness"
        to="/clients"
        icon={<ComputerDesktopIcon className="size-6" />}
        linkText="Clients"
      />
      <CoolNavLink
        dataTestid="nav-agents-button-witness"
        to="/agents"
        icon={<BotIcon className="size-6" />}
        linkText="Agents"
      />
      <CoolNavLink
        dataTestid="nav-testbeds-button-witness"
        to="/testbed-agents"
        icon={<WrenchScrewdriverIcon className="size-6" />}
        linkText="Testbed Agents"
      />
      <CoolNavLink
        dataTestid="nav-servers-button-witness"
        to="/servers"
        icon={<ServerStackIcon className="size-6" />}
        linkText="Servers"
      />
      <CoolNavLink
        dataTestid="nav-users-button-witness"
        to="/users"
        icon={<UserGroupIcon className="size-6" />}
        linkText="Users"
      />
      <CoolNavLink
        dataTestid="nav-projects-button-witness"
        to="/projects"
        icon={<RectangleStackIcon className="size-6" />}
        linkText="Projects"
      />
      <CoolNavLink
        dataTestid="nav-jwt-tokens-button-witness"
        to="/jwt-tokens"
        icon={<TagIcon className="size-6" />}
        linkText="Access tokens"
      />
      <div className="absolute bottom-4 left-6 right-6 text-slate-400 text-xs space-y-1 text-center">
        <Link
          data-testid="nav-changelog-button-witness"
          to="/changelog"
          className="block text-slate-300 hover:text-slate-100 transition-colors mb-1"
        >
          {latestVersion}
        </Link>
        <Link
          data-testid="nav-license-button-witness"
          to="/license"
          className="block text-slate-300 hover:text-slate-100 transition-colors"
        >
          © {getYear()} EU
        </Link>
      </div>
    </nav>
  );
}
