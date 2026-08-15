import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { requireTenant } from '@/lib/server-auth'
import { sendMail } from '@/lib/mail'
import { siteConfig } from '@/lib/site-config'

export async function GET() {
  try {
    const { tenant } = await requireTenant()
    const db = await getDb()
    const profile = await db.collection('whatsappProfiles').findOne({ tenantId: tenant._id })
    return NextResponse.json({ profile })
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
}

export async function POST(request: Request) {
  let user
  try {
    user = await requireTenant()
  } catch {
    return NextResponse.json({ error: 'Please sign in before sending an activation request.' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const now = new Date()
    const userId = new ObjectId(String(user.user._id))
    const profile = { tenantId: user.tenant._id, businessName: String(body.businessName || user.tenant.name || '').trim(), industry: String(body.industry || '').trim(), automations: Array.isArray(body.automations) ? body.automations.map(String) : [], enquiryVolume: String(body.enquiryVolume || '').trim(), businessContactNumber: String(body.businessContactNumber || '').trim(), hours: String(body.hours || '').trim(), whatsappConnectionStatus: 'NOT_CONNECTED', updatedAt: now }
    const db = await getDb()
    await db.collection('whatsappProfiles').updateOne({ tenantId: user.tenant._id }, { $set: profile, $setOnInsert: { userId, createdAt: now } }, { upsert: true })
    await db.collection('tenants').updateOne({ _id: user.tenant._id }, { $set: { name: profile.businessName || user.tenant.name, industry: profile.industry, updatedAt: now } })
    await db.collection('users').updateOne({ _id: userId }, { $set: { businessName: profile.businessName || user.user.businessName, phone: profile.businessContactNumber || user.user.phone, updatedAt: now } })
    await sendMail({
      to: process.env.ADMIN_NOTIFICATION_EMAIL || siteConfig.adminEmail,
      subject: `WhatsApp setup submitted: ${profile.businessName || user.user.name}`,
      text: `Client: ${user.user.name}\nEmail: ${user.user.email}\nBusiness: ${profile.businessName}\nIndustry: ${profile.industry}\nWhatsApp: ${profile.businessContactNumber}\nServices: ${profile.automations.join(', ')}\nEnquiry volume: ${profile.enquiryVolume}`,
    })
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    console.error('WhatsApp workspace setup failed:', error)
    return NextResponse.json({ error: 'Could not save workspace setup. Please try again.' }, { status: 500 })
  }
}
