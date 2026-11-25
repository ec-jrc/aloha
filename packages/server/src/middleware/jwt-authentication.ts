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

import { authentication_strategy, schemas } from "aloha-shared";
import { createSecretKey } from "crypto";
import { NextFunction, Request, RequestHandler, Response } from "express";
import * as jose from "jose";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import { CACHE_CHECK_PERIOD } from "../cache/cache-nodecache";

const logger = getLogger("JWT-AUTH-MIDDLEWARE");
const repository = () => injector().resolve("tokenRepository");
const tokensCache = () => injector().resolve("jwtCache");

export type AlohaJWTPayload = {
  tokenId: string;
  userId: string;
  sub: string;
  claims: string[];
  expirationDate: string;
};

const TOKEN_CACHE_TIMEOUT = 300;
const PROVIDER_NAME = "JWT";
const IN_MEMORY_ENTITY_TTL = TOKEN_CACHE_TIMEOUT + CACHE_CHECK_PERIOD + 5;

export const AGENT_PROJECT = "AGENT";

let onAuthFailure: authentication_strategy.AuthenticationStrategyOptions["onAuthFailure"];

const jwtAuthenticationStrategy: authentication_strategy.AuthenticationStrategy =
  {
    // eslint-disable-next-line @typescript-eslint/require-await
    async init(
      options?: Partial<authentication_strategy.AuthenticationStrategyOptions>
    ) {
      onAuthFailure = options?.onAuthFailure;
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async getAuthenticationMiddleware(): Promise<
      RequestHandler | RequestHandler[]
    > {
      logger().info("Server is starting with JWT token authentication.");

      const CLIENT_SECRET = injector().resolve("clientSecret");

      if (!CLIENT_SECRET) {
        throw new Error("CLIENT_SECRET environment variable is required");
      }

      const secretKey = createSecretKey(CLIENT_SECRET, "utf-8");

      return async (req, res, next) => {
        if (!authentication_strategy.isUserAuthenticated(req)) {
          // Check for Authentication Bearer token
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            const principal = await tokensCache().get(
              token,
              async () => {
                logger().debug("Token verification missed, searching database");
                try {
                  const decoded = await jose.jwtVerify<AlohaJWTPayload>(
                    token,
                    secretKey,
                    {
                      algorithms: ["HS256"],
                    }
                  );

                  const dbToken = await repository().findById(
                    decoded.payload.tokenId
                  );

                  if (!dbToken || dbToken.disabled) {
                    throw new Error("JWT token not found or is disabled");
                  }

                  const decodedToken = decoded.payload;

                  if (
                    !decodedToken.claims.includes(
                      authentication_strategy.Permissions.ProxyApiAccess
                    )
                  ) {
                    throw new Error("User lacks ProxyApiAccess permission");
                  }

                  const dbUser = cacheTempUserWithProjectAndPermissions(
                    await injector()
                      .resolve("userRepository")
                      .findById(decodedToken.userId),
                    decodedToken.userId + "." + decodedToken.tokenId,
                    decodedToken.sub,
                    decodedToken.claims
                  );

                  const dbAgent = await injector()
                    .resolve("agentRepository")
                    .findById(decodedToken.userId);

                  const finalUser:
                    | authentication_strategy.UserPrincipal
                    | undefined =
                    dbUser && dbUser.disabled !== true
                      ? {
                          id: dbUser.id,
                          userId: dbUser.userId,
                          displayName: dbUser.fullName,
                          permissions: dbUser.permissions,
                          provider: PROVIDER_NAME,
                        }
                      : dbAgent
                        ? {
                            id: dbAgent.id,
                            userId: dbAgent.id,
                            displayName: decodedToken.sub,
                            permissions: decodedToken.claims,
                            provider: PROVIDER_NAME,
                          }
                        : undefined;

                  if (!finalUser) {
                    throw new Error(`User or Agent not found`);
                  }

                  logger()
                    .child({ userId: finalUser.userId })
                    .debug(`User retrieved from JWT token`);

                  return finalUser;
                } catch (error) {
                  logger().child({ error }).error("JWT verification error");
                  onAuthFailure?.(PROVIDER_NAME, "invalid");
                  return null;
                }
              },

              TOKEN_CACHE_TIMEOUT
            );
            if (principal) {
              authentication_strategy.storeUserIntoSession(req, principal);
            }
          }
        }

        next();
      };
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async checkPermissions(
      user: authentication_strategy.UserPrincipal,
      requiredPermissions: string[]
    ) {
      if (user.provider !== PROVIDER_NAME) return false;
      return requiredPermissions.every((perm) =>
        user.permissions.includes(perm)
      );
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async login() {
      return (_req: Request, _res: Response, next: NextFunction) => {
        next();
      };
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async logout() {
      return (_req: Request, _res: Response, next: NextFunction) => {
        next();
      };
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async getInfo() {
      return {
        provider: PROVIDER_NAME,
      };
    },
  };

export default jwtAuthenticationStrategy;

export function createJwtToken(token: schemas.JWTTokenWithId) {
  const CLIENT_SECRET = injector().resolve("clientSecret");

  if (!CLIENT_SECRET) {
    throw new Error("CLIENT_SECRET environment variable is required");
  }
  const secretKey = createSecretKey(CLIENT_SECRET, "utf-8");

  const payload: AlohaJWTPayload = {
    tokenId: token.id,
    userId: token.userId,
    sub: token.projectId,
    claims: token.permissions,
    expirationDate: token.expirationDate.toUTCString(),
  };
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setSubject(token.projectId)
    .setExpirationTime(token.expirationDate)
    .sign(secretKey);
  // return jwt.sign(payload, CLIENT_SECRET);
}

function cacheTempUserWithProjectAndPermissions(
  user: schemas.UserWithId | null,
  newUserId: string,
  projectId: string,
  claims: string[]
) {
  if (!user) {
    return null;
  }
  const newUser: schemas.UserWithId = {
    ...user,
    projects: [projectId],
    permissions: claims,
    id: newUserId,
  };

  const userProject: schemas.ProjectWithId = {
    id: projectId,
    description: "Project From Token Claim",
    name: projectId,
    projectId: projectId,
  };

  injector()
    .resolve("usersCache")
    .put(newUser.id, newUser, IN_MEMORY_ENTITY_TTL);

  injector()
    .resolve("userProjectsCache")
    .put(newUser.id, [userProject], IN_MEMORY_ENTITY_TTL);

  return newUser;
}
