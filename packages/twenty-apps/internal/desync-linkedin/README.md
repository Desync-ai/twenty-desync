# Desync LinkedIn

The CRM side of the Desync LinkedIn extension. The extension only saves people; this app reads,
enriches and sends them, inside Twenty, so no key ever ships in the extension.

## What you get

| Function | Workflow step / AI tool | Writes |
|---|---|---|
| `classify-person` | **Classify lead**: TypeSafe Jev reads the person (name, title, company, city; never an email or link): one real person or not, and whether they fit your ICP. | Lead kind, Lead score, Classified at |
| `enrich-person-with-apollo` | **Enrich with Apollo**: Apollo people/match through Composio, by LinkedIn link, name and company. | Enrichment status, Suggested email, Suggested job title, Enriched at |
| `send-person-to-instantly` | **Send to Instantly**: adds the person to an Instantly campaign through Composio, with their email or the suggested one. | Sent to Instantly at |

Every function is a workflow step and an AI tool, so it runs from a workflow, from the copilot,
or from both.

Enrichment only ever writes the *Suggested* fields. A person's own Emails and Job Title are never
overwritten.

## Settings

Server (Desync's keys, set once): `TYPESAFE_API_KEY`, `TYPESAFE_MODEL` (empty: `jev-1.13.0`),
`COMPOSIO_API_KEY`.

Per workspace (Settings → Apps → Desync LinkedIn):

- `ICP_RUBRIC`: who you sell to, in plain words. Without it, Classify only tells people from pages.
- `COMPOSIO_USER_ID`: the Composio user whose Apollo and Instantly connections are used. In Desync
  CRM, that is the Twenty user id of whoever connected Apollo and Instantly.
- `INSTANTLY_CAMPAIGN_ID`: the default campaign for Send to Instantly.

## Suggested workflows

1. **New lead from the extension**: trigger *Record is created* on People, filter *Created by*
   source = API → Classify lead → if Lead kind is ICP → Enrich with Apollo.
2. **Send to Instantly**: trigger *When people are selected* → Enrich with Apollo (if Suggested
   email is empty) → Send to Instantly.

## Develop

```bash
yarn install
yarn test        # unit tests, no server needed
yarn typecheck
yarn lint
```
