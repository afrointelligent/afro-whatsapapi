'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, FileText, MessageCircle, ReceiptText, Send, Sparkles } from 'lucide-react'

const industries = ['Driving School', 'Plumbing', 'Electrical', 'Healthcare', 'Property / Estate Agency', 'Tourism', 'E-commerce', 'Professional Services', 'Other']
const services = [
  ['Answer enquiries', 'Reply instantly to common WhatsApp questions.', MessageCircle],
  ['Capture leads', 'Collect contact details and qualify new customers.', FileText],
  ['Manage bookings', 'Offer times, confirm appointments and send reminders.', CalendarDays],
  ['Send quotes', 'Prepare owner-approved quote requests from chat.', Send],
  ['Request payments', 'Share secure payment links and track payment status.', ReceiptText],
  ['Follow up clients', 'Keep enquiries moving without manual chasing.', Clock3],
  ['Other', 'Tell us what else you need WhatsApp to do.', Sparkles],
] as const
const volumes = ['Under 50 / month', '50–200 / month', '200–500 / month', '500–1,000 / month', '1,000+ / month']

export default function WhatsAppOnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ businessName: '', industry: '', automations: [] as string[], enquiryVolume: '', businessContactNumber: '', hours: 'Mon–Fri, 08:00–17:00' })
  const [otherService, setOtherService] = useState('')
  const screens = [
    ['01 · BUSINESS PROFILE', 'Tell us about your business.', 'This makes your workspace feel like yours from day one.'],
    ['02 · SERVICES', 'What should WhatsApp handle?', 'Choose everything you want to start with. You can change it anytime.'],
    ['03 · ENQUIRIES', 'How busy is your WhatsApp?', 'We will recommend the right setup for your volume.'],
    ['04 · CONTACT', 'What WhatsApp number does your business use?', 'Use the number customers already know. It can stay in Demo Mode while activation is arranged.'],
    ['05 · READY', 'Your request is ready to send.', 'We will review your setup and help activate your WhatsApp workspace.'],
  ]
  const [eyebrow, title, helper] = screens[step]

  const toggle = (name: string) => setForm(current => ({ ...current, automations: current.automations.includes(name) ? current.automations.filter(item => item !== name) : [...current.automations, name] }))
  const validation = () => {
    if (step === 0 && (!form.businessName.trim() || !form.industry)) return 'Enter your business name and choose an industry.'
    if (step === 1 && !form.automations.length) return 'Choose at least one WhatsApp service.'
    if (step === 1 && form.automations.includes('Other') && !otherService.trim()) return 'Tell us what else you need WhatsApp to do.'
    if (step === 2 && !form.enquiryVolume) return 'Choose your monthly enquiry volume.'
    if (step === 3 && form.businessContactNumber.replace(/\D/g, '').length < 9) return 'Enter a valid WhatsApp number, for example +27 67 608 7645.'
    return ''
  }
  async function next() {
    setError('')
    const message = validation()
    if (message) return setError(message)
    if (step < 4) return setStep(value => value + 1)
    setSaving(true)
    try {
      const response = await fetch('/api/client/whatsapp-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, automations: form.automations.map(item => item === 'Other' ? `Other: ${otherService.trim()}` : item) }) })
      if (response.status === 401) return router.replace('/login?whatsapp=1')
      if (!response.ok) throw new Error('Could not save your request. Please try again.')
      router.push('/whatsapp/dashboard')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your request.') } finally { setSaving(false) }
  }

  return <main className="min-h-screen bg-[#f4faf6] px-4 py-8 text-[#10231c] sm:px-8 sm:py-14"><div className="mx-auto w-full max-w-4xl"><button onClick={() => router.push('/whatsapp')} className="mb-7 inline-flex items-center gap-2 text-sm font-bold text-[#547064] hover:text-[#17844f]"><ArrowLeft className="h-4 w-4" /> Back to Afro Intelligent</button><section className="overflow-hidden rounded-[36px] border border-[#dcebe2] bg-white shadow-2xl shadow-[#123b2b]/10"><header className="border-b border-[#dcebe2] bg-[#fbfdfb] px-7 py-6 sm:px-12"><div className="mb-4 flex items-center justify-between"><p className="flex items-center gap-2 text-xs font-black tracking-[.17em] text-[#17844f]"><Sparkles className="h-4 w-4" /> AFRO INTELLIGENT · WHATSAPP SETUP</p><span className="text-sm font-bold text-[#547064]">{step + 1} of 5</span></div><div className="h-2 overflow-hidden rounded-full bg-[#e6f0e9]"><div className="h-full rounded-full bg-[#39b96a] transition-all duration-500" style={{ width: `${((step + 1) / 5) * 100}%` }} /></div></header><div className="px-7 py-10 sm:px-12 sm:py-14"><p className="text-xs font-black tracking-[.17em] text-[#17844f]">{eyebrow}</p><h1 className="mt-4 max-w-2xl text-4xl font-black tracking-[-.055em] sm:text-5xl">{title}</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-[#547064]">{helper}</p>
        {step === 0 && <div className="mt-10 grid gap-6"><label className="grid gap-2 text-sm font-bold">Business name<input autoFocus value={form.businessName} onChange={event => setForm({ ...form, businessName: event.target.value })} placeholder="e.g. Afro Drive Academy" className="rounded-2xl border border-[#c7e0d1] px-5 py-4 text-lg outline-none focus:border-[#17844f] focus:ring-4 focus:ring-[#dff7e7]" /></label><div><p className="mb-3 text-sm font-bold">Business type</p><div className="flex flex-wrap gap-2">{industries.map(item => <button key={item} onClick={() => setForm({ ...form, industry: item })} className={`rounded-full border px-4 py-2.5 text-sm font-bold transition ${form.industry === item ? 'border-[#17844f] bg-[#17844f] text-white' : 'border-[#c7e0d1] hover:border-[#17844f]'}`}>{item}</button>)}</div></div></div>}
        {step === 1 && <div className="mt-10 grid gap-3 sm:grid-cols-2">{services.map(([name, detail, Icon]) => { const selected = form.automations.includes(name); return <button key={name} onClick={() => toggle(name)} className={`rounded-3xl border p-5 text-left transition ${selected ? 'border-[#17844f] bg-[#effaf2] ring-2 ring-[#b5f5cb]' : 'border-[#dcebe2] hover:border-[#17844f]'}`}><span className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? 'bg-[#17844f] text-white' : 'bg-[#eff8f1] text-[#17844f]'}`}><Icon className="h-5 w-5" /></span><div className="mt-5 flex justify-between gap-3"><div><p className="font-black">{name}</p><p className="mt-1 text-sm leading-5 text-[#547064]">{detail}</p></div>{selected && <Check className="h-5 w-5 shrink-0 text-[#17844f]" />}</div></button> })}{form.automations.includes('Other') && <label className="rounded-3xl border border-[#17844f] bg-[#effaf2] p-5 sm:col-span-2"><span className="text-sm font-black text-[#17844f]">DESCRIBE YOUR SERVICE</span><input autoFocus value={otherService} onChange={event => setOtherService(event.target.value)} placeholder="e.g. Send stock alerts, collect delivery addresses…" className="mt-3 w-full border-b-2 border-[#a9cbbc] bg-transparent py-3 text-lg outline-none focus:border-[#17844f]" /></label>}</div>}
        {step === 2 && <div className="mt-10 grid gap-3">{volumes.map(item => <button key={item} onClick={() => setForm({ ...form, enquiryVolume: item })} className={`flex items-center justify-between rounded-2xl border p-5 text-left font-bold transition ${form.enquiryVolume === item ? 'border-[#17844f] bg-[#effaf2] text-[#17844f]' : 'border-[#dcebe2] hover:border-[#17844f]'}`}><span>{item}</span>{form.enquiryVolume === item && <Check className="h-5 w-5" />}</button>)}</div>}
        {step === 3 && <div className="mt-10 grid gap-6"><label className="grid gap-2 text-sm font-bold">WhatsApp business number<input autoFocus inputMode="tel" value={form.businessContactNumber} onChange={event => setForm({ ...form, businessContactNumber: event.target.value })} placeholder="+27 67 608 7645" className="rounded-2xl border border-[#c7e0d1] px-5 py-4 text-lg outline-none focus:border-[#17844f] focus:ring-4 focus:ring-[#dff7e7]" /></label><label className="grid gap-2 text-sm font-bold">Working hours<select value={form.hours} onChange={event => setForm({ ...form, hours: event.target.value })} className="rounded-2xl border border-[#c7e0d1] bg-white px-5 py-4"><option>Mon–Fri, 08:00–17:00</option><option>Mon–Sat, 08:00–17:00</option><option>Every day, 08:00–17:00</option><option>24 hours</option></select></label><div className="rounded-2xl bg-[#fff7d9] p-5 text-sm leading-6"><b>Demo Mode first.</b> Your workspace is private to your account. Production Meta WhatsApp activation happens after review.</div></div>}
        {step === 4 && <div className="mt-10 rounded-3xl bg-[#123b2b] p-7 text-white"><p className="text-xs font-black tracking-[.16em] text-[#8fe5b0]">ACTIVATION REQUEST</p><h2 className="mt-3 text-2xl font-black">{form.businessName}</h2><div className="mt-6 grid gap-3 text-sm text-white/75 sm:grid-cols-2"><p><b className="text-white">Industry:</b> {form.industry}</p><p><b className="text-white">Number:</b> {form.businessContactNumber}</p><p><b className="text-white">Services:</b> {form.automations.length}</p><p><b className="text-white">Volume:</b> {form.enquiryVolume}</p></div><p className="mt-6 text-sm leading-6 text-white/70">After sending, your own dashboard will open. You can track requests, messages, invoices, support and activation updates there.</p></div>}
        {error && <p role="alert" className="mt-7 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}<footer className="mt-10 flex items-center gap-4">{step > 0 && <button onClick={() => { setError(''); setStep(value => value - 1) }} className="inline-flex items-center gap-2 rounded-full border border-[#c7e0d1] px-5 py-3.5 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Back</button>}<button disabled={saving} onClick={next} className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#17844f] px-7 py-4 font-bold text-white shadow-lg shadow-[#17844f]/20 hover:bg-[#126d40] disabled:opacity-60">{saving ? 'Sending request…' : step === 4 ? 'Send activation request' : 'Continue'} <ArrowRight className="h-4 w-4" /></button></footer></div></section></div></main>
}
