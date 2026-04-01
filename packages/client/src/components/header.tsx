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

import UserForm from "@/app/users/user-form";
import { UserContext } from "@/context/contexes";
import { useForceRefreshUser } from "@/context/user-context-provider";
import { cn } from "@/lib/utils";
import {
  ComputerDesktopIcon,
  HomeIcon,
  UserIcon as NotLoggedIcon,
  RectangleStackIcon,
  ServerStackIcon,
  TagIcon,
  UserCircleIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Bars3Icon } from "@heroicons/react/24/solid";
import { authentication_strategy } from "aloha-shared";
import { BotIcon } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { Link, NavLink } from "react-router";
import { PATH_LOGIN, PATH_LOGOUT } from "../app/routing";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function logout() {
  window.location.href = PATH_LOGOUT;
}

function login() {
  window.location.href = PATH_LOGIN;
}

function getYear() {
  return new Date().getFullYear();
}

function OpenProfileDropdownMenuItem({
  userId,
}: {
  userId: string | undefined;
}) {
  const forceRefreshUser = useForceRefreshUser();
  if (!userId) {
    return null;
  }
  return (
    <UserForm
      userId={userId}
      onAccept={async () => {
        forceRefreshUser();
      }}
      updateCurrentUser={true}
    >
      <DropdownMenuItem
        onSelect={(evt) => {
          evt.preventDefault();
        }}
      >
        Profile
      </DropdownMenuItem>
    </UserForm>
  );
}

function MobileNavLink({
  to,
  end,
  icon,
  linkText,
  alwaysActive = false,
  onClick,
}: {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  linkText: string;
  alwaysActive?: boolean;
  onClick: () => void;
}) {
  const user = useContext(UserContext);

  if (!user && !alwaysActive) {
    return (
      <div className="flex items-center gap-3 p-3 text-gray-500 rounded-lg">
        <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
        <span className="text-sm">{linkText}</span>
      </div>
    );
  }

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 p-3 rounded-lg transition-colors text-sm",
          isActive
            ? "bg-slate-100 text-slate-900"
            : "text-slate-200 hover:bg-slate-800/50"
        )
      }
    >
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      <span>{linkText}</span>
    </NavLink>
  );
}

export default function Header() {
  const user = useContext(UserContext);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkDevice();
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
  }, []);

  // Close mobile menu when clicking outside or on menu items
  useEffect(() => {
    if (mobileMenuOpen) {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (
          !target.closest(".mobile-menu") &&
          !target.closest(".menu-trigger")
        ) {
          setMobileMenuOpen(false);
        }
      };
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [mobileMenuOpen]);

  const LogoComponent = () => (
    <div
      className="text-3xl font-light tracking-widest cursor-pointer transition-colors hover:text-slate-100"
      onClick={() => (window.location.href = "/")}
    >
      A L O H A
    </div>
  );

  const MobileMenu = () => (
    <>
      {/* Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu Panel */}
      <div
        className={cn(
          "mobile-menu fixed top-0 right-0 h-full w-80 bg-slate-900/95 backdrop-blur-lg border-l border-slate-700/50 z-50 transform transition-transform duration-300 ease-in-out",
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="p-6 h-full overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-semibold text-slate-200">Menu</h2>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* User Section */}
          {user && user.id !== authentication_strategy.ANONYMOUS_USER && (
            <div className="mb-8 p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <UserCircleIcon className="w-10 h-10 text-slate-300" />
                <div>
                  <p className="text-slate-200 font-medium">
                    {user.displayName}
                  </p>
                  <p className="text-slate-400 text-sm">{user.email}</p>
                </div>
              </div>
            </div>
          )}

          {/* Menu Items */}
          <nav className="space-y-1">
            <MobileNavLink
              to="/"
              end
              icon={<HomeIcon className="w-5 h-5" />}
              linkText="Home"
              alwaysActive={true}
              onClick={() => setMobileMenuOpen(false)}
            />
            <MobileNavLink
              to="/clients"
              icon={<ComputerDesktopIcon className="w-5 h-5" />}
              linkText="Clients"
              onClick={() => setMobileMenuOpen(false)}
            />
            <MobileNavLink
              to="/agents"
              icon={<BotIcon className="w-5 h-5" />}
              linkText="Agents"
              onClick={() => setMobileMenuOpen(false)}
            />
            <MobileNavLink
              to="/testbed-agents"
              icon={<WrenchScrewdriverIcon className="w-5 h-5" />}
              linkText="Testbed Agents"
              onClick={() => setMobileMenuOpen(false)}
            />
            <MobileNavLink
              to="/servers"
              icon={<ServerStackIcon className="w-5 h-5" />}
              linkText="Servers"
              onClick={() => setMobileMenuOpen(false)}
            />
            <MobileNavLink
              to="/users"
              icon={<UserGroupIcon className="w-5 h-5" />}
              linkText="Users"
              onClick={() => setMobileMenuOpen(false)}
            />
            <MobileNavLink
              to="/projects"
              icon={<RectangleStackIcon className="w-5 h-5" />}
              linkText="Projects"
              onClick={() => setMobileMenuOpen(false)}
            />
            <MobileNavLink
              to="/jwt-tokens"
              icon={<TagIcon className="w-5 h-5" />}
              linkText="Access tokens"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Login/Logout */}
            {user == null ||
            user.id == authentication_strategy.ANONYMOUS_USER ? (
              <button
                onClick={() => {
                  login();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors text-left mt-4"
              >
                <NotLoggedIcon className="w-5 h-5" />
                <span className="text-sm">Login</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors text-left mt-4"
              >
                <NotLoggedIcon className="w-5 h-5" />
                <span className="text-sm">Logout</span>
              </button>
            )}

            <div className="absolute bottom-6 left-6 right-6 text-slate-400 text-xs space-y-1 text-center">
              <Link
                to="/changelog"
                className="block text-slate-300 hover:text-slate-100 transition-colors mb-1"
              >
                Changelog
              </Link>
              <Link
                to="/license"
                className="block text-slate-300 hover:text-slate-100 transition-colors"
              >
                © {getYear()} EU
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <>
        {/* Mobile Header*/}
        {/* <div className="p-4 text-slate-200 flex justify-center items-center bg-slate-900/95 backdrop-blur border-b border-slate-700/30">
          <LogoComponent />
        </div> */}

        {/* Mobile Menu */}
        <MobileMenu />

        {/* Mobile Bottom Navigation Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/98 backdrop-blur-lg border-t border-slate-700/50">
          <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
            {/* Home */}
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center p-2 min-w-[64px] transition-colors",
                  isActive
                    ? "text-slate-100"
                    : "text-slate-300 hover:text-slate-100"
                )
              }
            >
              <HomeIcon className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Home</span>
            </NavLink>

            {/* Menu */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="menu-trigger flex flex-col items-center justify-center p-2 min-w-[64px] text-slate-300 hover:text-slate-100 transition-colors"
            >
              <Bars3Icon className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Menu</span>
            </button>

            {/* User Profile */}
            {user == null ||
            user.id == authentication_strategy.ANONYMOUS_USER ? (
              <button
                onClick={() => login()}
                className="flex flex-col items-center justify-center p-2 min-w-[64px] text-slate-300 hover:text-slate-100 transition-colors"
              >
                <NotLoggedIcon className="w-6 h-6 mb-1" />
                <span className="text-xs font-medium">Login</span>
              </button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex flex-col items-center justify-center p-2 min-w-[64px] text-slate-300 hover:text-slate-100 transition-colors">
                    <UserCircleIcon className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium truncate max-w-[60px]">
                      {user?.displayName?.split(" ")[0] || "Profile"}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-56 mb-2"
                  align="center"
                  side="top"
                >
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user?.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <OpenProfileDropdownMenuItem userId={user?.id} />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="text-red-600 focus:text-red-600"
                  >
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="p-4 px-8 text-slate-200 flex justify-between items-center border-b border-slate-700/30 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60">
      <LogoComponent />

      {user == null || user.id == authentication_strategy.ANONYMOUS_USER ? (
        <Button
          data-testid="login-witness"
          variant="ghost"
          className="flex items-center gap-2 text-slate-200 hover:text-slate-100 hover:bg-slate-800/50"
          onClick={() => login()}
        >
          <span className="italic">login</span>
          <NotLoggedIcon className="w-5 h-5" />
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 text-slate-200 hover:text-slate-100 hover:bg-slate-800/50"
            >
              <span className="font-medium" data-testid="logged-in-witness">
                {user?.displayName}
              </span>
              <UserCircleIcon className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <OpenProfileDropdownMenuItem userId={user?.id} />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="logout-witness"
              onClick={() => logout()}
              className="text-red-600 focus:text-red-600"
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
