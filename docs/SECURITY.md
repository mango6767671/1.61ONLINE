# Security policy

## Reporting

Do not publish exploitable vulnerabilities, private keys, access tokens, passwords, or personal data in issues. Contact the maintainers privately and include reproduction steps and impact.

## Development requirements

- Never commit `.env`, credentials, tokens, private keys, or production data.
- Use unique secrets in every environment.
- Keep dependencies patched and review dependency changes.
- Validate all client input and use parameterized SQL.
- Hash passwords with Argon2id; never log passwords or bearer tokens.
- Keep currency, inventory, progression, and rewards server-authoritative.
- Apply rate limits to authentication and other abuse-sensitive routes.
- Use HTTPS in deployed environments and restrict database network access.
- Do not trust client-provided identity, rank, money, inventory, or mission outcomes.

## Scope

Only test systems and accounts you own or are explicitly authorized to assess. Do not probe Rockstar services or third-party infrastructure.
