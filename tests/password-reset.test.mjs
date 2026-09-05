import assert from 'node:assert/strict'
import test from 'node:test'
import { ObjectId } from 'mongodb'
import { consumePasswordResetToken, createPasswordResetToken, hashPassword, validatePassword, verifyPassword } from '../dist/auth.js'

function fakeDb() {
  const user = { _id: new ObjectId(), email: 'owner@example.com', firstName: 'Owner', status: 'ACTIVE', passwordHash: '' }
  const resets = []
  return {
    user,
    resets,
    collection(name) {
      if (name === 'users') return {
        findOne: async query => query.email === user.email && query.status === user.status ? user : null,
        updateOne: async (query, update) => { if (!query._id.equals(user._id)) return { modifiedCount: 0 }; Object.assign(user, update.$set); return { modifiedCount: 1 } },
      }
      if (name === 'passwordResetTokens') return {
        updateMany: async (query, update) => { for (const item of resets) if (item.userId.equals(query.userId) && item.usedAt === query.usedAt) Object.assign(item, update.$set); return {} },
        insertOne: async item => { resets.push(item); return { insertedId: new ObjectId() } },
        findOneAndUpdate: async (query, update) => { const item = resets.find(value => value.tokenHash === query.tokenHash && value.usedAt === null && value.expiresAt > query.expiresAt.$gt); if (!item) return null; Object.assign(item, update.$set); return item },
      }
      if (name === 'auditLogs') return { insertOne: async () => ({ insertedId: new ObjectId() }) }
      throw new Error(`Unexpected collection: ${name}`)
    },
  }
}

test('password reset stores only a hash and is single use', async () => {
  const db = fakeDb()
  db.user.passwordHash = await hashPassword('OriginalPassword123!')
  const reset = await createPasswordResetToken(db, db.user.email)
  assert.ok(reset)
  assert.equal(db.resets.length, 1)
  assert.notEqual(db.resets[0].tokenHash, reset.token)
  assert.equal('token' in db.resets[0], false)
  assert.equal(await consumePasswordResetToken(db, reset.token, 'ReplacementPassword123!'), true)
  assert.equal(await consumePasswordResetToken(db, reset.token, 'AnotherPassword123!'), false)
  assert.equal(await verifyPassword('ReplacementPassword123!', db.user.passwordHash), true)
})

test('expired reset tokens cannot be consumed', async () => {
  const db = fakeDb()
  const reset = await createPasswordResetToken(db, db.user.email)
  db.resets[0].expiresAt = new Date(Date.now() - 1000)
  assert.equal(await consumePasswordResetToken(db, reset.token, 'ReplacementPassword123!'), false)
})

test('password policy remains at least 12 characters', () => {
  assert.throws(() => validatePassword('short'), /12 characters/)
  assert.doesNotThrow(() => validatePassword('long-enough-password'))
})
