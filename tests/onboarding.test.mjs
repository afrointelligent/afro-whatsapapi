import test from 'node:test'
import assert from 'node:assert/strict'
import { canLaunchEmbeddedSignup, hasConnectableBusinessProfile } from '../dist/onboarding.js'

const completeProfile = {
  legalBusinessName: 'Review Business',
  displayName: 'Review Business',
  industry: 'Services',
  country: 'ZA',
  businessEmail: 'review@example.com',
  businessPhone: '+27110000000',
  businessDescription: 'A safe review workspace',
}

test('a complete business profile can launch Embedded Signup with zero documents', () => {
  assert.equal(hasConnectableBusinessProfile(completeProfile), true)
  assert.equal(canLaunchEmbeddedSignup(completeProfile, false), true)
})

test('optional document and internal review statuses cannot block Embedded Signup', () => {
  for (const verificationSubmissionStatus of ['NOT_SUBMITTED', 'SUBMITTED_FOR_REVIEW', 'MORE_INFORMATION_REQUIRED', 'AFROINTELLIGENT_REJECTED']) {
    assert.equal(canLaunchEmbeddedSignup({ ...completeProfile, verificationSubmissionStatus }, false), true)
  }
})

test('an existing real connection prevents starting a duplicate signup', () => {
  assert.equal(canLaunchEmbeddedSignup(completeProfile, true), false)
})
