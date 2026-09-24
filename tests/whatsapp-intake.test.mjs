import test from 'node:test'
import assert from 'node:assert/strict'
import { planIntake, businessClock, menu, questions } from '../dist/whatsapp-intake.js'
import { sendMetaButtons } from '../dist/whatsapp-outbound.js'
const morning = new Date('2026-09-24T07:00:00Z')
process.env.WHATSAPP_BUSINESS_OPEN = '08:00'; process.env.WHATSAPP_BUSINESS_CLOSE = '17:00'
test('Johannesburg greeting, boundaries, Saturday and Sunday', () => {
  assert.equal(businessClock(morning).greeting, 'Good morning')
  assert.equal(businessClock(new Date('2026-09-24T10:00:00Z')).greeting, 'Good afternoon')
  assert.equal(businessClock(new Date('2026-09-24T16:00:00Z')).greeting, 'Good evening')
  assert.equal(businessClock(new Date('2026-09-26T07:00:00Z')).open, true)
  assert.equal(businessClock(new Date('2026-09-27T07:00:00Z')).open, false)
  assert.equal(businessClock(new Date('2026-09-24T06:00:00Z')).open, true)
  assert.equal(businessClock(new Date('2026-09-24T15:00:00Z')).open, false)
  assert.equal(businessClock(morning, 'invalid', '17:00').open, false)
})
test('menu has stable valid Meta buttons and no AI needed', () => {
  const plan = planIntake(undefined, 'Hi', undefined, morning, 'hi')
  assert.match(plan.reply, /Good morning/); assert.deepEqual(plan.buttons, menu)
  assert.ok(menu.every(button => button.title.length <= 20)); assert.equal(menu.length, 3)
})
for (const flow of menu) test(`${flow.title} asks one question at a time then hands off`, () => {
  let plan = planIntake(undefined, flow.title, flow.id, morning, 'button')
  assert.equal(plan.state.step, 0); assert.equal(plan.reply, questions[flow.id][0][1])
  for (let index = 0; index < questions[flow.id].length; index++) {
    plan = planIntake(plan.state, `Answer ${index}`, undefined, new Date(+morning + (index + 1) * 3000), `answer-${index}`)
    assert.equal(plan.state.step, index + 1)
  }
  assert.equal(plan.qualified, true); assert.equal(plan.handoff, true)
  assert.equal(Object.keys(plan.state.answers).length, questions[flow.id].length)
  assert.equal(planIntake(plan.state, 'More consulting', undefined, new Date(+morning + 60000), 'more').reply, undefined)
})
test('Sunday sends one deterministic notice per day, without starting intake', () => {
  const date = new Date('2026-09-27T07:00:00Z')
  const plan = planIntake(undefined, 'Hello', undefined, date, 'hi')
  assert.match(plan.reply, /closed on Sundays/); assert.equal(plan.buttons, undefined)
  assert.equal(planIntake(plan.state, 'Again', undefined, date, 'again').reply, undefined)
})
test('duplicate, cooldown, long input, reply cap and human requests are bounded', () => {
  const plan = planIntake(undefined, 'Hello', undefined, morning, 'hi')
  assert.equal(planIntake(plan.state, 'Hello', undefined, new Date(+morning + 3000), 'hi').reply, undefined)
  assert.equal(planIntake(plan.state, 'Hello again', undefined, new Date(+morning + 1000), 'different').reply, undefined)
  for (const [state, input] of [[undefined, 'x'.repeat(2001)], [{ ...plan.state, count: 30 }, 'Another question'], [undefined, 'I need a human']]) {
    const result = planIntake(state, input, undefined, new Date(+morning + 60000), input)
    assert.equal(result.handoff, true); assert.doesNotMatch(result.reply, /credit|token|free/i)
  }
})
test('Meta button sender rejects too many buttons or overlong titles before network use', async () => {
  const connection = { phoneNumberId: 'test', accessToken: 'test', apiVersion: 'v25.0' }
  await assert.rejects(sendMetaButtons(connection, '123', 'Hi', [...menu, menu[0]]), /Invalid reply buttons/)
  await assert.rejects(sendMetaButtons(connection, '123', 'Hi', [{ id: 'x', title: 'x'.repeat(21) }]), /Invalid reply buttons/)
})
