# Meta Permission Map

Request only permissions needed by implemented reviewer-visible functionality.

| Capability | Permission typically involved | Current product use |
| --- | --- | --- |
| Send and receive WhatsApp messages | `whatsapp_business_messaging` | Cloud API messages, signed webhook inbox, dashboard replies |
| Manage WhatsApp business assets used by onboarding | `whatsapp_business_management` | Embedded Signup authorization, authorized WABA phone-number discovery and app subscription |

The current Advanced Access request is limited to `whatsapp_business_management`. Do not request Facebook, Instagram, Ads, template, or other permissions for functionality that is not implemented. Confirm Meta's current official Embedded Signup requirements before changing the requested scope.

Production URLs:

- App Domain: `automate.afrointelligent.co.za`
- Callback: `https://automate.afrointelligent.co.za/webhooks/whatsapp`
- Privacy: `https://automate.afrointelligent.co.za/privacy`
- Terms: `https://automate.afrointelligent.co.za/terms`
- Data Deletion: `https://automate.afrointelligent.co.za/data-deletion`
