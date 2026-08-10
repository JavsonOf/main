# MCP Supabase Server

> **Model Context Protocol (MCP) Server for Supabase**
> 
> Seamlessly integrate your Supabase databases, storage, and authentication with Claude Code and other MCP-compatible clients.

---

## Overview

This MCP server provides a bridge between [Supabase](https://supabase.com) and [Model Context Protocol](https://modelcontextprotocol.io/) clients like Claude Code. It enables AI assistants to interact with your Supabase projects through a standardized interface, allowing for:

- **Database Operations**: Query, insert, update, and delete records using PostgreSQL
- **Real-time Subscriptions**: Listen to database changes via Supabase Realtime
- **Storage Access**: Read, write, and manage files in Supabase Storage
- **Authentication**: Secure access using Supabase Auth (JWT tokens)
- **Edge Functions**: Execute serverless functions

---

## Features

| Feature | Description | Status |
|---------|-------------|--------|
| PostgreSQL Queries | Execute raw SQL or use a query builder | ✅ Active |
| Table Operations | CRUD operations on tables | ✅ Active |
| Realtime Subscriptions | Listen to database changes | ✅ Active |
| Storage Access | File upload/download/delete | ✅ Active |
| Authentication | JWT-based auth with Supabase | ✅ Active |
| Edge Functions | Call deployed Edge Functions | ✅ Active |
| Row Level Security | Respects Supabase RLS policies | ✅ Active |
| Connection Pooling | Efficient database connections | ✅ Active |
| Type Safety | TypeScript support for schemas | ✅ Active |

---

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js**: Version 18 or higher
- **npm** or **yarn**: Package manager of your choice
- **Supabase Project**: A project created at [supabase.com](https://supabase.com)
- **Supabase URL & API Key**: Found in Project Settings > API
- **MCP Client**: Claude Code or other MCP-compatible application

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/mcp-supabase-setup.git
cd mcp-supabase-setup
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Optional: For development
PORT=3000
LOG_LEVEL=info
```

> **Security Note**: Never commit your `.env` file to version control. Add it to `.gitignore`.

### 4. Build the Server

```bash
npm run build
```

---

## Configuration

### Server Configuration File

Create a `config.json` file to define your Supabase connection:

```json
{
  "supabase": {
    "url": "${SUPABASE_URL}",
    "anonKey": "${SUPABASE_ANON_KEY}",
    "serviceRoleKey": "${SUPABASE_SERVICE_ROLE_KEY}"
  },
  "mcp": {
    "serverName": "supabase-server",
    "version": "1.0.0",
    "capabilities": {
      "database": true,
      "storage": true,
      "realtime": true,
      "auth": true
    }
  },
  "security": {
    "allowedOrigins": ["*"],
    "rateLimit": {
      "requestsPerMinute": 60
    }
  }
}
```

### Multiple Supabase Projects

To connect to multiple Supabase projects, use an array configuration:

```json
{
  "projects": [
    {
      "name": "production",
      "url": "https://your-prod-project.supabase.co",
      "anonKey": "prod-anon-key",
      "serviceRoleKey": "prod-service-key"
    },
    {
      "name": "staging",
      "url": "https://your-staging-project.supabase.co",
      "anonKey": "staging-anon-key"
    }
  ]
}
```

---

## Usage

### Starting the Server

```bash
# Development mode
npm run dev

# Production mode
npm start

# With custom config
npm start -- --config path/to/config.json
```

The server will start on the port specified in your `.env` file (default: 3000).

### Connecting with Claude Code

1. **Install Claude Code** extension in your IDE
2. **Add MCP Server** to your Claude Code configuration:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-supabase", "--config", "/path/to/config.json"],
      "env": {
        "SUPABASE_URL": "your-url",
        "SUPABASE_ANON_KEY": "your-key"
      }
    }
  }
}
```

3. **Restart your IDE** to apply changes

---

## API Reference

### Database Tools

#### `list_tables`
List all tables in the connected database.

**Parameters:**
- `schema` (optional): Schema name (default: `public`)
- `include_system` (optional): Include system tables (default: `false`)

**Returns:** Array of table objects with name, schema, and column information.

**Example:**
```
list_tables(schema="public")
```

---

#### `query`
Execute a SQL query.

**Parameters:**
- `sql` (required): The SQL query string
- `params` (optional): Query parameters as array
- `return_type` (optional): `json`, `csv`, or `raw` (default: `json`)

**Returns:** Query results as specified format.

**Example:**
```
query(sql="SELECT * FROM users WHERE email = $1", params=["user@example.com"])
```

---

#### `insert`
Insert records into a table.

**Parameters:**
- `table` (required): Table name
- `records` (required): Array of objects to insert
- `upsert` (optional): Use upsert mode (default: `false`)
- `return_records` (optional): Return inserted records (default: `true`)

**Returns:** Inserted records or count.

**Example:**
```
insert(table="users", records=[{"name": "John", "email": "john@example.com"}])
```

---

#### `update`
Update records in a table.

**Parameters:**
- `table` (required): Table name
- `updates` (required): Object with column-value pairs to update
- `where` (required): Where clause object
- `return_records` (optional): Return updated records (default: `true`)

**Returns:** Updated records or count.

**Example:**
```
update(
  table="users",
  updates={"status": "active"},
  where={"id": {"_eq": 1}}
)
```

---

#### `delete`
Delete records from a table.

**Parameters:**
- `table` (required): Table name
- `where` (required): Where clause object
- `return_records` (optional): Return deleted records (default: `false`)

**Returns:** Deleted count or records.

**Example:**
```
delete(table="users", where={"id": {"_eq": 1}})
```

---

### Storage Tools

#### `list_buckets`
List all storage buckets.

**Returns:** Array of bucket objects.

---

#### `list_files`
List files in a bucket.

**Parameters:**
- `bucket` (required): Bucket name
- `path` (optional): Path prefix to filter
- `limit` (optional): Maximum number of files to return
- `offset` (optional): Pagination offset

**Returns:** Array of file objects.

**Example:**
```
list_files(bucket="avatars", path="users/", limit=10)
```

---

#### `upload_file`
Upload a file to storage.

**Parameters:**
- `bucket` (required): Bucket name
- `path` (required): Destination path (including filename)
- `content` (required): File content as base64 string or buffer
- `content_type` (optional): MIME type
- `cache_control` (optional): Cache-Control header
- `upsert` (optional): Overwrite existing file (default: `false`)

**Returns:** Uploaded file metadata.

**Example:**
```
upload_file(
  bucket="documents",
  path="contracts/agreement.pdf",
  content="base64-encoded-content",
  content_type="application/pdf"
)
```

---

#### `download_file`
Download a file from storage.

**Parameters:**
- `bucket` (required): Bucket name
- `path` (required): File path

**Returns:** File content as base64 string.

**Example:**
```
download_file(bucket="avatars", path="users/john/profile.jpg")
```

---

#### `delete_file`
Delete a file from storage.

**Parameters:**
- `bucket` (required): Bucket name
- `path` (required): File path

**Returns:** Deletion confirmation.

---

### Realtime Tools

#### `subscribe`
Subscribe to database changes.

**Parameters:**
- `table` (required): Table name
- `event_types` (optional): Array of events (`INSERT`, `UPDATE`, `DELETE`, `*`) (default: `["*"]`)
- `filter` (optional): Filter object for row-level filtering

**Returns:** Subscription ID for management.

**Example:**
```
subscribe(
  table="orders",
  event_types=["INSERT"],
  filter={"status": {"_eq": "pending"}}
)
```

---

#### `unsubscribe`
Unsubscribe from a channel.

**Parameters:**
- `subscription_id` (required): Subscription ID to remove

---

### Authentication Tools

#### `sign_in`
Sign in with email and password.

**Parameters:**
- `email` (required): User email
- `password` (required): User password

**Returns:** Session object with JWT token.

---

#### `sign_up`
Create a new user account.

**Parameters:**
- `email` (required): User email
- `password` (required): User password
- `metadata` (optional): User metadata object

**Returns:** User object with session.

---

#### `sign_out`
Sign out the current user.

**Returns:** Sign out confirmation.

---

#### `get_session`
Get the current session.

**Returns:** Current session object or null.

---

## Examples

### Example 1: Basic CRUD Operations

```python
# List all users
users = query(sql="SELECT id, name, email FROM users")

# Insert a new user
new_user = insert(
    table="users",
    records=[{"name": "Alice", "email": "alice@example.com", "status": "active"}]
)

# Update user status
updated = update(
    table="users",
    updates={"status": "premium"},
    where={"email": {"_eq": "alice@example.com"}}
)

# Delete inactive users
deleted = delete(
    table="users",
    where={"status": {"_eq": "inactive"}}
)
```

---

### Example 2: File Management

```python
# Upload a profile picture
upload_result = upload_file(
    bucket="avatars",
    path="users/alice/avatar.jpg",
    content="base64-image-data",
    content_type="image/jpeg"
)

# List all avatars
avatars = list_files(bucket="avatars")

# Download a specific file
download_result = download_file(bucket="avatars", path="users/alice/avatar.jpg")

# Delete old files
delete_file(bucket="temp", path="old/data.csv")
```

---

### Example 3: Realtime Notifications

```python
# Subscribe to new orders
subscription = subscribe(
    table="orders",
    event_types=["INSERT"],
    filter={"status": {"_eq": "pending"}}
)

# Process incoming events
while True:
    event = get_next_event(subscription)
    if event:
        print(f"New order: {event.new}")
        # Send notification, update dashboard, etc.
```

---

### Example 4: Complex Queries

```python
# Get user orders with joins
orders = query(sql="""
    SELECT 
        o.id, o.amount, o.status,
        u.name as user_name, u.email,
        p.name as product_name
    FROM orders o
    JOIN users u ON o.user_id = u.id
    JOIN products p ON o.product_id = p.id
    WHERE o.status = $1
    ORDER BY o.created_at DESC
    LIMIT 10
""", params=["completed"])

# Aggregate data
total_sales = query(sql="""
    SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(amount) as total,
        COUNT(*) as count
    FROM orders
    GROUP BY month
    ORDER BY month
""")
```

---

## Security

### Authentication Modes

This server supports multiple authentication modes:

1. **Anonymous Key**: Uses Supabase anon key (read-only for public tables)
2. **Service Role Key**: Full access (use with caution)
3. **User JWT**: Authenticates as a specific user (respects RLS)

### Row Level Security (RLS)

All queries respect Supabase RLS policies. Ensure your policies are properly configured:

```sql
-- Example RLS policy
CREATE POLICY "Enable read access for authenticated users"
ON public.users
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for everyone"
ON public.feedback
FOR INSERT
WITH CHECK (true);
```

### Rate Limiting

Built-in rate limiting prevents abuse:

- Default: 60 requests per minute per client
- Configurable via `config.json`
- Returns `429 Too Many Requests` when exceeded

---

## Error Handling

All tools return structured error responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "hint": "Additional context",
      "query": "The SQL query that failed"
    }
  }
}
```

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `CONNECTION_ERROR` | Cannot connect to Supabase | Check URL and network |
| `AUTH_ERROR` | Authentication failed | Verify API keys |
| `QUERY_ERROR` | SQL syntax or execution error | Fix query or permissions |
| `NOT_FOUND` | Resource not found | Verify table/bucket exists |
| `PERMISSION_DENIED` | RLS policy blocked access | Update RLS policies |
| `RATE_LIMITED` | Too many requests | Wait and retry |

---

## Development

### Running Tests

```bash
# Unit tests
npm test

# Integration tests (requires Supabase)
npm run test:integration

# Test coverage
npm run test:coverage
```

### Project Structure

```
.
├── src/
│   ├── index.ts              # Server entry point
│   ├── config/
│   │   ├── index.ts          # Configuration loader
│   │   └── schema.ts         # Configuration schema
│   ├── database/
│   │   ├── client.ts         # Supabase client
│   │   ├── query.ts          # Query builder
│   │   └── tools.ts          # Database tools
│   ├── storage/
│   │   ├── client.ts         # Storage client
│   │   └── tools.ts          # Storage tools
│   ├── realtime/
│   │   ├── client.ts         # Realtime client
│   │   └── tools.ts          # Realtime tools
│   ├── auth/
│   │   ├── client.ts         # Auth client
│   │   └── tools.ts          # Auth tools
│   └── utils/
│       ├── logger.ts         # Logging utility
│       └── errors.ts         # Error handling
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example
├── config.example.json
├── package.json
└── README.md
```

---

### Building from Source

```bash
# Clone repository
git clone https://github.com/your-username/mcp-supabase-setup.git
cd mcp-supabase-setup

# Install dependencies
npm install

# Build
npm run build

# Link locally (for development)
npm link
```

---

## Troubleshooting

### Connection Issues

**Symptom**: `CONNECTION_ERROR` when starting server

**Solutions:**
1. Verify `SUPABASE_URL` is correct (should end with `.supabase.co`)
2. Check network connectivity to Supabase
3. Ensure Supabase project is not in maintenance mode
4. Test with Supabase JavaScript client directly

---

### Authentication Failures

**Symptom**: `AUTH_ERROR` or `JWT invalid`

**Solutions:**
1. Verify `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
2. Regenerate keys in Supabase dashboard if compromised
3. For user auth, ensure JWT is valid and not expired
4. Check `auth.jwt()` function in Supabase SQL

---

### Permission Denied

**Symptom**: `PERMISSION_DENIED` on queries

**Solutions:**
1. Check RLS policies on the table: `SELECT * FROM pg_policies;`
2. Ensure policies allow the operation for the current role
3. For service role key, RLS is bypassed (use with caution)
4. For user JWT, policies must explicitly allow access

---

### Query Timeouts

**Symptom**: Queries hang or timeout

**Solutions:**
1. Add indexes to frequently queried columns
2. Use `LIMIT` clauses on large tables
3. Increase statement timeout: `SET statement_timeout = 30000;`
4. Optimize complex queries with `EXPLAIN ANALYZE`

---

## Performance Optimization

### Database

1. **Add Indexes**: Create indexes on frequently filtered columns
   ```sql
   CREATE INDEX idx_users_email ON users(email);
   ```

2. **Use Connection Pooling**: Configure pool size in `config.json`
   ```json
   {
     "database": {
       "poolSize": 10,
       "maxQueriesPerConnection": 5
     }
   }
   ```

3. **Batch Operations**: Use bulk inserts/updates when possible

### Storage

1. **Use CDN**: Enable Supabase Storage CDN for public files
2. **Cache Headers**: Set appropriate `Cache-Control` headers
3. **Compress Files**: Compress files before upload

### Realtime

1. **Filter Subscriptions**: Use `filter` parameter to reduce data transfer
2. **Limit Event Types**: Subscribe only to needed events
3. **Unsubscribe When Done**: Always unsubscribe when no longer needed

---

## Contributing

Contributions are welcome! Please follow these guidelines:

### Getting Started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Use TypeScript for type safety
- Follow ESLint rules (`npm run lint`)
- Use Prettier for formatting (`npm run format`)
- Include tests for new features

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description

body

footer
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Support

- **Documentation**: [Model Context Protocol](https://modelcontextprotocol.io/)
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **Community**: [GitHub Discussions](https://github.com/your-username/mcp-supabase-setup/discussions)
- **Issues**: [GitHub Issues](https://github.com/your-username/mcp-supabase-setup/issues)

---

## Changelog

### v1.0.0 (2026-08-10)
- Initial release
- Full database CRUD support
- Storage operations
- Realtime subscriptions
- Authentication integration
- Comprehensive error handling
- TypeScript support

---

## Roadmap

- [ ] GraphQL API support
- [ ] WebSocket compression
- [ ] Query result pagination helpers
- [ ] Bulk data export/import tools
- [ ] Multi-database support
- [ ] Performance metrics dashboard
- [ ] Auto-generated TypeScript types from schema

---

*Built with love for the Supabase and MCP communities*