import { WhatsAppExperience } from '@/components/whatsapp-experience'
import { LiveWhatsAppDashboard } from '@/components/live-whatsapp-dashboard'

export default async function WhatsAppDemoPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams
  if (params.mode === 'dashboard') return <LiveWhatsAppDashboard />
  return <WhatsAppExperience mode="dashboard" />
}
