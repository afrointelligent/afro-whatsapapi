# Meta WhatsApp Messaging Review Video

Purpose: show the real `whatsapp_business_messaging` permission in use. This is not a marketing video.

## Recording Setup

- Use the production/review application after local readiness is green: `https://automate.afrointelligent.co.za`
- Use the prepared Afro Drive Academy review workspace.
- Keep passwords, access tokens, app secret, verify token and private customer data out of frame.
- Use a readable split-screen layout:
  - Left: WhatsApp Web or test phone conversation.
  - Right: Afro Intelligent Inbox.

## Sequence

1. Open `https://automate.afrointelligent.co.za`.
2. Show that the product is Afro Intelligent WhatsApp Automation.
3. Log in to the review workspace without exposing the password.
4. Open the dashboard Inbox.
5. Put WhatsApp beside the Inbox.
6. From WhatsApp, send: `Hi, I would like to book a driving lesson.`
7. Show the message appearing in Afro Intelligent Inbox.
8. Reply from Afro Intelligent: `Hi, I can help you book a driving lesson. Which lesson would you like?`
9. Show the reply arriving in WhatsApp.
10. If stable, click `Take Over`, send one manual reply, then click `Resume AI`.
11. Stop recording.

## What Meta Must See

- A real inbound WhatsApp message delivered to Afro Intelligent.
- The tenant Inbox receiving the message.
- A real outbound reply sent from Afro Intelligent through Meta Cloud API.
- The reply arriving in WhatsApp.

## Do Not Show

- Access tokens.
- App secret.
- Verify token.
- Passwords.
- MongoDB connection strings.
- Fake animation as proof of permission use.
- Payment as the main story.
