import { cookies } from 'next/headers'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { getSessionCookieName, verifySession } from '@/lib/session'
import type { AppUser } from '@/lib/users'
import { getTenantContextForUser } from '@/lib/tenancy'

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const session = verifySession(cookieStore.get(getSessionCookieName())?.value)
  if (!session) return null

  const db = await getDb()
  if (!ObjectId.isValid(session.id)) return null
  const user = await db.collection<AppUser>('users').findOne({ _id: new ObjectId(session.id) })
  if (!user) return null
  return user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'admin') throw new Error('Forbidden')
  return user
}

export async function requireClient() {
  const user = await requireUser()
  if (user.role !== 'client') throw new Error('Forbidden')
  return user
}

export async function requireTenant() {
  const user = await requireClient()
  const context = await getTenantContextForUser(user)
  if (context.tenant.status === 'SUSPENDED') throw new Error('This workspace is suspended')
  return { user, ...context }
}
