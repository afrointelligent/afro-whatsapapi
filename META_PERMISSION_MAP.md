# Meta Permission Map

Request only permissions needed by implemented reviewer-visible functionality.

| Capability | Permission typically involved | Current product use |
| --- | --- | --- |
| Send and receive WhatsApp messages | `whatsapp_business_messaging` | Cloud API messages, signed webhook inbox, dashboard replies |
| Manage WhatsApp business assets used by onboarding | `whatsapp_business_management` | WABA, phone-number and connection management when Embedded Signup is implemented |
| Access business assets during Tech Provider onboarding | `business_management` | Only where required by the current official Embedded Signup flow |

Exact permission requirements can change. Confirm them in Meta's current official WhatsApp Business Platform and Embedded Signup documentation before submission. Do not request broader access merely for future features.

Production URLs:

- App Domain: `automate.afrointelligent.co.za`
- Callback: `https://automate.afrointelligent.co.za/webhooks/whatsapp`
- Privacy: `https://automate.afrointelligent.co.za/privacy`
- Terms: `https://automate.afrointelligent.co.za/terms`
- Data Deletion: `https://automate.afrointelligent.co.za/data-deletion`
