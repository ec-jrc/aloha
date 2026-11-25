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

import { authentication_strategy } from "aloha-shared";
import * as express from "express";
import { RequestHandler } from "express";
//import fetch from "node-fetch";

import * as jose from "jose";
import * as openIdClient from "openid-client";

import { resolve } from "url";
import { injector } from "../injector/injector";
import { getLogger } from "../injector/provide-logger";
import {
  createUserPrincipalFromIdentity,
  getTokenSetFromSession,
  Identity,
  isJwtTokenSetExpired,
  OIDC_PROVIDER_NAME,
  resolveDisplayName,
  storeTokenSetIntoSession,
  TokenSet,
  TokenSetSchema,
} from "./oidc/oidc-support";

const logger = getLogger(OIDC_PROVIDER_NAME + "-MIDDLEWARE");

function safeDecodeJwt(
  token: string | undefined
): jose.JWTPayload | null | string {
  if (!token) {
    return null;
  }
  try {
    return jose.decodeJwt(token);
  } catch {
    return token;
  }
}

class OidcAuthPlugin implements authentication_strategy.AuthenticationStrategy {
  async init() {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async getAuthenticationMiddleware(
    getUserDetail: authentication_strategy.GetUserDetailFunction
  ): Promise<RequestHandler | RequestHandler[]> {
    logger().info("Using OIDC authentication");
    const router = express.Router();

    const homepage = injector().resolve("oidcHome");

    const codeRedirectUri = injector().resolve("oidcCodeRedirectUri");
    if (!codeRedirectUri) {
      throw new Error(`No OIDC_CODE_REDIRECT_URI variable provided`);
    }

    router.use((req, res, next) => {
      const tokenSet = getTokenSetFromSession(req);

      if (
        authentication_strategy.isUserAuthenticated(req) &&
        authentication_strategy.getUserFromSession(req).provider ===
          OIDC_PROVIDER_NAME &&
        tokenSet &&
        isJwtTokenSetExpired(tokenSet)
      ) {
        logger()
          .child({
            username: authentication_strategy.getUserFromSession(req).userId,
          })
          .warn("TokenSet expired");
        authentication_strategy.clearSession(req, () => {
          return res.status(401).json({ error: "TokenSet expired" }).end();
        });
        return;
      }
      next();
    });

    router.get("/api/oauth2/login", async (req, res) => {
      logger().debug("Start OIDC Authorization With Par");

      const codeVerifier = openIdClient.randomPKCECodeVerifier();

      req.session["codeVerifier"] = codeVerifier;

      const codeChallenge =
        await openIdClient.calculatePKCECodeChallenge(codeVerifier);

      const parameters: Record<string, string> = {
        redirect_uri: codeRedirectUri,
        scope: injector().resolve("oidcScope"),
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      };

      const redirectTo = await openIdClient.buildAuthorizationUrlWithPAR(
        await this.getOpenIdClientConfiguration(),
        parameters
      );

      return res.redirect(redirectTo.href);
    });

    router.get("/api/oauth2/code/login", async (req, res) => {
      logger().debug("Continue with OIDC Authorization Code Grant");

      const codeVerifier = req.session["codeVerifier"] as string;

      const params = req.query as Record<string, string>;

      if (!codeVerifier) {
        throw new Error(`No codeVerifier in session`);
      }
      const currentUrl = new URL(codeRedirectUri);

      Object.keys(params).forEach((k) =>
        currentUrl.searchParams.append(k, params[k])
      );

      const tokens = await openIdClient.authorizationCodeGrant(
        await this.getOpenIdClientConfiguration(),
        new URL(currentUrl),
        { pkceCodeVerifier: codeVerifier }
      );

      const log = logger().child({
        id_token: tokens.id_token ? jose.decodeJwt(tokens.id_token) : null,
        access_token: safeDecodeJwt(tokens.access_token),
      });

      const tokenSet: TokenSet = TokenSetSchema.parse(tokens);

      storeTokenSetIntoSession(req, tokenSet);

      // await idpsupport.init();
      //
      // const uname = await idpsupport.tokenExchange(tokenSet, "calculator");
      //
      // logger()
      //   .child({
      //     id_token: jose.decodeJwt(uname.id_token!),
      //     access_token: jose.decodeJwt(uname.access_token),
      //   })
      //   .debug("exchange tokens");

      delete req.session["codeVerifier"];

      const { id_token } = tokenSet;

      if (!id_token) {
        log.error("No id_token found");
        return res.redirect("/unauthorised");
      }

      const decodedIdToken = jose.decodeJwt(id_token);

      const username: string | undefined =
        (decodedIdToken.username as string | undefined) ||
        (decodedIdToken.preferred_username as string | undefined) ||
        decodedIdToken.sub;

      const identity: Identity = {
        clientId:
          (decodedIdToken.azp as string | undefined) ||
          (decodedIdToken.client_id as string | undefined) ||
          "unknown client id",
        scope:
          (decodedIdToken.scope as string | undefined) ||
          injector().resolve("oidcScope"),
        username,
        name: resolveDisplayName(decodedIdToken, username),
        exp: decodedIdToken.exp,
        iat: decodedIdToken.iat,
      };

      const userPrincipal = await createUserPrincipalFromIdentity(
        id_token,
        identity,
        getUserDetail,
        tokenSet.expires_in
      );

      if (!userPrincipal) {
        log.error("Unable to fetch user principal");
        return res.redirect(resolve(homepage, "/unauthorised"));
      }

      authentication_strategy.storeUserIntoSession(req, userPrincipal);

      res.redirect(homepage);
    });

    return router;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async checkPermissions(
    user: authentication_strategy.UserPrincipal,
    requiredPermissions: string[]
  ) {
    if (user.provider !== OIDC_PROVIDER_NAME) return false;
    return requiredPermissions.every((perm) => user.permissions.includes(perm));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async login(): Promise<RequestHandler | RequestHandler[]> {
    return (_req, res) => {
      return res.redirect("/api/oauth2/login");
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async logout(): Promise<RequestHandler | RequestHandler[]> {
    return (req, res, next) => {
      if (authentication_strategy.isUserAuthenticated(req)) {
        const user = authentication_strategy.getUserFromSession(req);

        if (user.provider !== OIDC_PROVIDER_NAME) {
          return next();
        }

        injector().resolve("usersCache").del(user.id);

        authentication_strategy.clearSession(req, (err) => {
          if (err) {
            logger().error("Error clearing session", err);
          }
          res.redirect("/");
        });
      } else {
        next();
      }
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getInfo() {
    return {
      provider: OIDC_PROVIDER_NAME,
    };
  }

  private async getOpenIdClientConfiguration() {
    const idp = injector().resolve("oidcIdentityPropagationService");
    if (!idp) {
      throw Error("IdentityPropagationService required");
    }

    const idps = await idp;
    return await idps.getConfiguration();
  }
}

export default new OidcAuthPlugin();
