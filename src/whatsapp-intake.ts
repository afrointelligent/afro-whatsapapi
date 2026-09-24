export const menu = [
  { id: 'GET_MORE_BOOKINGS', title: 'Get More Bookings' },
  { id: 'DIAGNOSE_BUSINESS', title: 'Diagnose My Business' },
  { id: 'AUTOMATE_WHATSAPP', title: 'Automate My WhatsApp' },
]
export const questions: Record<string, Array<[string, string]>> = {
  GET_MORE_BOOKINGS: [
    ['business', 'What is your business name, and what kind of business do you run?'],
    ['market', 'Where are you based, and which customers do you serve?'],
    ['acquisition', 'How do customers usually find your business?'],
    ['booking', 'How do people currently book or contact you?'],
    ['problem', 'What is the biggest difficulty with turning enquiries into bookings?'],
    ['outcome', 'What would you most like to improve?'],
  ],
  DIAGNOSE_BUSINESS: [
    ['business', 'What is your business name, and what do you offer?'],
    ['market', 'Who are your customers, and where do you serve them?'],
    ['process', 'How does an enquiry become a paying customer today?'],
    ['problem', 'Where do things get stuck or customers drop off?'],
    ['outcome', 'What result would make the biggest difference for your business?'],
  ],
  AUTOMATE_WHATSAPP: [
    ['business', 'We can help with customer replies, booking enquiries and getting the right enquiries to your team. What is your business name and type?'],
    ['setup', 'How do you use WhatsApp for your business at the moment?'],
    ['volume', 'Roughly how many customer enquiries do you receive each day?'],
    ['outcome', 'Which part would you most like us to help automate?'],
  ],
}
export type IntakeState = { status: 'menu' | 'collecting' | 'handoff'; flow?: string; step: number; answers: Record<string, string>; startedAt: string; count: number; lastAt?: string; lastHash?: string; closedNoticeDate?: string; reason?: string }
export type IntakePlan = { state: IntakeState; reply?: string; buttons?: typeof menu; qualified?: boolean; handoff?: boolean }
export function businessClock(now: Date, open = process.env.WHATSAPP_BUSINESS_OPEN || '08:00', close = process.env.WHATSAPP_BUSINESS_CLOSE || '17:00') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]))
  const time = `${parts.hour}:${parts.minute}`
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(open) && /^([01]\d|2[0-3]):[0-5]\d$/.test(close) && open < close
  return { date: `${parts.year}-${parts.month}-${parts.day}`, greeting: Number(parts.hour) < 12 ? 'Good morning' : Number(parts.hour) < 17 ? 'Good afternoon' : 'Good evening', sunday: parts.weekday === 'Sun', open: valid && parts.weekday !== 'Sun' && time >= open && time < close, hours: `${open} to ${close}, Monday to Saturday (South African time)` }
}
export function planIntake(previous: IntakeState | undefined, input: string, button: string | undefined, now: Date, hash: string): IntakePlan {
  const state: IntakeState = previous ? structuredClone(previous) : { status: 'menu', step: 0, answers: {}, startedAt: now.toISOString(), count: 0 }
  if (state.status === 'handoff') return { state }
  const clock = businessClock(now)
  if (!clock.open) {
    if (state.closedNoticeDate === clock.date) return { state }
    state.closedNoticeDate = clock.date
    return { state, reply: `${clock.greeting}. Thank you for contacting Afro Intelligent. ${clock.sunday ? 'We are closed on Sundays.' : 'Our team is currently offline.'} Our hours are ${clock.hours}. Please leave a short message and we will continue with you when we reopen.` }
  }
  if (state.lastHash === hash && state.lastAt && now.getTime() - Date.parse(state.lastAt) < 60000) return { state }
  if (state.lastAt && now.getTime() - Date.parse(state.lastAt) < 2000) return { state }
  state.lastAt = now.toISOString(); state.lastHash = hash; state.count++
  if (input.length > 2000 || state.count > 30 || now.getTime() - Date.parse(state.startedAt) > 86400000) {
    state.status = 'handoff'; state.reason = 'Intake limit reached'
    return { state, handoff: true, reply: 'Thank you for sharing this. Our team will review your enquiry and continue with you during business hours.' }
  }
  if (/\b(human|person|agent|consultant|call me|speak to someone|not sure|do not know|don.t know)\b/i.test(input)) {
    state.status = 'handoff'; state.reason = 'Customer requested assistance'
    return { state, handoff: true, reply: 'Of course. A member of the Afro Intelligent team will continue with you here during business hours.' }
  }
  if (button && questions[button]) {
    state.flow = button; state.step = 0; state.answers = {}; state.status = 'collecting'
    return { state, reply: questions[button][0][1] }
  }
  if (state.status === 'menu' || /^(hi|hello|hey|morning|good (morning|afternoon|evening)|menu)[!.\s]*$/i.test(input.trim())) {
    state.status = 'menu'
    return { state, reply: `${clock.greeting}! Welcome to Afro Intelligent. How can we assist your business today?`, buttons: menu }
  }
  const flow = questions[state.flow || '']
  if (!flow || !input.trim() || /^\[.+\]$/.test(input.trim())) return { state, reply: 'Please send a short text answer so we can understand your business.' }
  state.answers[flow[state.step][0]] = input.trim(); state.step++
  if (state.step < flow.length) return { state, reply: flow[state.step][1] }
  state.status = 'handoff'; state.reason = 'Qualification complete'
  return { state, qualified: true, handoff: true, reply: 'Thank you. We have enough information to understand the situation. The Afro Intelligent team will review your business and continue with you here during business hours.' }
}
export function intakeSummary(state: IntakeState) {
  return Object.entries(state.answers).map(([key, answer]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${answer}`).join('\n') || 'Customer requested assistance before completing intake.'
}
