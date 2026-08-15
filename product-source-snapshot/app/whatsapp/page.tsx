import type { Metadata } from 'next'
import { WhatsAppExperience } from '@/components/whatsapp-experience'

export const metadata: Metadata = {
  title: 'WhatsApp Automation',
  description: 'Turn WhatsApp conversations into bookings, qualified leads, quotes and payments.',
}

export default function WhatsAppPage() {
  return <WhatsAppExperience mode="landing" />
}
