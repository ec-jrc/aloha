# Projects & Access Management

[← Back to Index](./index.md)

---

## Projects

### What is their Purpose?

Aloha Projects are associated with users and clients, and they involve various administrative tasks and functionalities. Projects are designed to give users access to various clients.

### Project-Based Access Control

**Example:** If a user is assigned to the "example-project" project, they will only see the clients associated with this project.

### Key Features

- **User association** - Link users to specific projects
- **Client association** - Control which clients are available
- **Access scoping** - Limit visibility based on project membership
- **Administrative tasks** - Manage permissions and resources

---

## Users

### User Management

The administrator can:

- Create users
- Manage user permissions
- Assign users to projects
- Control access levels

### User Roles

Users have different permission levels that determine:

- Which clients they can access
- Which servers they can use
- What administrative actions they can perform
- Which projects they belong to

---

## Access Tokens

### What are Access Tokens?

Tokens are access keys for use of Aloha and are associated with projects.

### Token Management

- **Creation** - Tokens can be created for specific projects
- **Association** - Linked to projects and users
- **Authorization** - Control access to servers and clients
- **Security** - Ensure only authorized users can access resources

### Token Usage

Once a token is created, it can be used by the designated user to interact with the server. This setup ensures that only authorized users can access and manage the server.

### Token Lifecycle

1. **Creation** - Administrator creates token for a project
2. **Assignment** - Token is assigned to specific users
3. **Usage** - Users authenticate using the token
4. **Management** - Tokens can be revoked or regenerated as needed

---

## Visibility Settings

All resources (servers, clients, and agents) support three visibility levels:

### Private

- Only you can see and use this item
- Complete isolation from other users
- Ideal for personal development and testing

### Public

- Everyone can see and use this item
- Only you can change it
- Suitable for shared resources and tools

### Managed

- Only users in selected projects can see and use this item
- Only you can change it
- Project-based access control
- Best for team collaboration

---

## Navigation

- [← Previous: Servers](./servers.md)
- [Next: Miscellaneous →](./miscellaneous.md)
- [Go to Index](./index.md)
