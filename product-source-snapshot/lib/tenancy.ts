import { ObjectId, type WithId } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import type { AppUser } from '@/lib/users'

export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED'
export type TenantRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export type Tenant = {
  _id?: ObjectId
  name: string
  slug: string
  industry?: string
  country?: string
  status: TenantStatus
  createdAt: Date
  updatedAt: Date
}

export type TenantMembership = {
  _id?: ObjectId
  tenantId: ObjectId
  userId: ObjectId
  role: TenantRole
  createdAt: Date
  updatedAt: Date
}

export type TenantContext = {
  tenant: WithId<Tenant>
  membership: WithId<TenantMembership>
}

function slugify(value: string) {
  const base = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return base || 'business'
}

export async function createTenantForUser(input: {
  userId: ObjectId
  businessName?: string
  industry?: string
  country?: string
}) {
  const db = await getDb()
  const now = new Date()
  const name = input.businessName?.trim() || 'My Business'
  const tenant: Tenant = {
    name,
    slug: `${slugify(name)}-${input.userId.toString().slice(-6)}`,
    industry: input.industry?.trim() || '',
    country: input.country?.trim() || 'South Africa',
    status: 'TRIAL',
    createdAt: now,
    updatedAt: now,
  }

  const inserted = await db.collection<Tenant>('tenants').insertOne(tenant)
  await db.collection<TenantMembership>('tenantMemberships').insertOne({
    tenantId: inserted.insertedId,
    userId: input.userId,
    role: 'OWNER',
    createdAt: now,
    updatedAt: now,
  })
  await db.collection<AppUser>('users').updateOne(
    { _id: input.userId },
    { $set: { tenantId: inserted.insertedId, updatedAt: now } }
  )
  return inserted.insertedId
}

/**
 * Resolves a tenant for a client user. Legacy accounts are safely migrated the
 * first time they access a tenant-scoped feature, preserving existing data.
 */
export async function getTenantContextForUser(user: WithId<AppUser>): Promise<TenantContext> {
  if (user.role !== 'client') throw new Error('A client workspace is required')
  if (!user._id || !ObjectId.isValid(String(user._id))) throw new Error('Invalid user')

  const db = await getDb()
  const userId = new ObjectId(String(user._id))
  let membership = await db.collection<TenantMembership>('tenantMemberships').findOne({ userId })

  if (!membership) {
    const tenantId = await createTenantForUser({ userId, businessName: user.businessName })
    membership = await db.collection<TenantMembership>('tenantMemberships').findOne({ userId, tenantId })
  }

  if (!membership) throw new Error('Workspace membership could not be created')
  const tenant = await db.collection<Tenant>('tenants').findOne({ _id: membership.tenantId })
  if (!tenant) throw new Error('Workspace not found')
  return { tenant, membership }
}

export async function ensureTenantIndexes() {
  const db = await getDb()
  await Promise.all([
    db.collection<Tenant>('tenants').createIndex({ slug: 1 }, { unique: true }),
    db.collection<TenantMembership>('tenantMemberships').createIndex({ tenantId: 1, userId: 1 }, { unique: true }),
    db.collection<TenantMembership>('tenantMemberships').createIndex({ userId: 1 }),
  ])
}
