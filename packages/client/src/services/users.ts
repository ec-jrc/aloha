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
import { customFetch } from "./utils";

const apiBaseUrl = "/api";
const apiUsersUrl = "/api/user";

export async function updateCurrentUserInfo(user: Partial<schemas.User>) {
  await customFetch(
    "Update user",
    `${apiBaseUrl}/user-info/updateCurrentUserInfo`,
    {
      method: "POST",
      body: JSON.stringify(user),
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function getUserInfo(): Promise<authentication_strategy.UserPrincipalWithProjects | null> {
  const response = await customFetch(
    "Get authenticated user info",
    `${apiBaseUrl}/user-info`
  );
  if (response.status === 204) return null;
  const resp = await response.json();
  return authentication_strategy.UserPrincipalWithProjectsSchema.parse(resp);
}

// Get all users
export async function getUsersList(): Promise<schemas.UserWithId[]> {
  const response = await customFetch("Get user list", `${apiUsersUrl}/`);
  const data = await response.json();
  return data;
}

// Get user details by ID
export async function getUserDetail(
  id: string
): Promise<schemas.UserWithId | null> {
  const response = await customFetch("Get user detail", `${apiUsersUrl}/${id}`);
  const data = await response.json();
  return data;
}

// Create a new user
export async function createUser(user: schemas.User): Promise<void> {
  await customFetch("Create user", apiUsersUrl, {
    method: "POST",
    body: JSON.stringify(user),
    headers: { "Content-Type": "application/json" },
  });
}

// Update user by ID
export async function updateUser(
  id: string,
  user: Partial<schemas.User>
): Promise<void> {
  await customFetch("Update user", `${apiUsersUrl}/${id}`, {
    method: "POST",
    body: JSON.stringify(user),
    headers: { "Content-Type": "application/json" },
  });
}

// Delete user by ID
export async function deleteUser(id: string): Promise<void> {
  await customFetch("Delete user", `${apiUsersUrl}/${id}/_delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}
