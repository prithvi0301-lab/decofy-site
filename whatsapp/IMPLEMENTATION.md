# Decofy — Guided WhatsApp-first lead journey (draft)

**Target number:** +91 95911 28007. **CRM source of truth:** HubSpot. **Status:** implementation-ready design only; not activated on WhatsApp, not merged into the website.

## Customer journey
1. Meta click-to-WhatsApp ad opens the Decofy chat; the customer sends the pre-filled enquiry starter, without writing requirements.
2. Once the number is API-enabled, an automated reply provides a **Start enquiry** WhatsApp Flow button.
3. Customer selects four short sets of choices: **Product** → **Project type** → **Timeline** → **Bengaluru region**. The selections are in `decofy-lead-flow.json`.
4. After submitting, Meta delivers the flow response to an authorised webhook/inbox. A salesperson can reply immediately; qualified lead details should be created/updated in HubSpot. **This inbound webhook and HubSpot integration are not yet implemented.**
5. Salesperson confirms exact locality and scope, arranges a site visit, creates quotation, tracks order value in HubSpot.

No customer name, phone number, or marketing consent is inferred from a Flow screen. The sender WhatsApp ID becomes available only through the authorised WhatsApp Business Platform event. Marketing consent, if desired, needs a separate clear opt-in and unsubscribe handling. Do not send outbound promotional messages without consent or an approved template when required.

## Feasibility prerequisites (blockers)
- Verify the **8007 WhatsApp Business app** is eligible for business-app / Cloud API coexistence. The number is not currently verified as API-enabled. If unsupported, **do not unregister or migrate it** without owner approval. Keep incoming messages and existing chats safe.
- Verify that Decofy's correct Meta Business portfolio owns the WhatsApp Business Account (WABA) and number, and that WhatsApp Manager exposes **Account tools → Flows** for the eligible account.
- Set up business API credentials and subscribed message / interactive webhooks in an authorised backend. Never commit private keys, access tokens, or customer messages to GitHub. Do not expose tokens through WhatsApp links or analytics.
- Create the flow under the correct WABA in WhatsApp Manager, paste `decofy-lead-flow.json` into its editor, run **Meta's Flow validation**, preview, then publish only after validation.
- Send the published Flow to a staff test contact in an open service window using the approved WhatsApp Business Platform message interface. Verify interactive submission reaches Decofy's authorised operator. Adjust API/message template as required by Meta's current rules.
- HubSpot's **native WhatsApp inbox is not included in HubSpot Free**. Use existing HubSpot CRM to manage leads; a minimal authorised sync may be built separately after confirming the Cloud API account, secure credentials, and required scopes. Never claim that the Grok→HubSpot connection also syncs WhatsApp messages.

## Meta ad strategy
**Do not enable spending just because this file exists.** Keep existing budget, creative, targeting, Page, phone number and website unchanged until authorised live testing. In the click-to-WhatsApp message template, avoid the currently broken three-tap suggestions until repaired; use a **pre-filled initial send** to open the 24-hour conversation. Then deliver the guided Flow inside the chat, only after customer initiation.

## Minimum acceptance tests before approval to resume paid traffic
- 8007 app works: human can send/receive messages, including when phone is locked.
- Customer from a separate device opens the real ad, sends the pre-filled initial message, receives the Flow button, chooses every selection, and submits successfully.
- Full response (product, project_type, timeline, area and sender WhatsApp ID) arrives exactly once in the authorised WhatsApp inbox/webhook, without test leads mixed into real sales data.
- Human can respond immediately; duplicate events do not duplicate a contact or a deal.
- HubSpot reflects lead owner, pipeline stage, attribution source and next task; verify manually if automated sync isn't ready.
- Consent rules, 24-hour window and template use are obeyed. Confirm latest per-message costs before marketing sends.
- Confirm Meta status and evaluate actual qualified leads, appointments, quotations, confirmed order values and ROAS, not clicks alone.

**Release gate:** No production traffic switch, API migration, PR merge, new subscription or bulk customer messaging without explicit owner approval and passing tests.
