'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, BarChart3, Bot, CalendarCheck, Check, ChevronRight, CircleDollarSign, Clock3, Maximize2, MessageCircle, Play, Share2, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react'

type Mode = 'landing' | 'dashboard' | 'video'
type Step = 0 | 1 | 2 | 3 | 4

const messages = [
  ['Thabo M.', 'Hi, I’d like to book a driving lesson for Saturday.', 'incoming'],
  ['Afro Assistant', 'Absolutely. Which service would you like?', 'assistant'],
  ['Thabo M.', 'Driving Lesson', 'incoming'],
  ['Afro Assistant', 'Great. What time works best?', 'assistant'],
  ['Thabo M.', '11:00', 'incoming'],
  ['Afro Assistant', 'Perfect. Your lesson is reserved for Saturday at 11:00.', 'assistant'],
] as const

const capabilities = [
  ['Answer faster', 'Handle common customer questions immediately, even while you are busy.'],
  ['Capture every lead', 'Collect the details your team needs and keep every enquiry organised.'],
  ['Book & remind', 'Create bookings, confirmations and reminders from one conversation.'],
  ['Quote & get paid', 'Prepare owner-approved quotes, invoices and payment requests.'],
]

export function WhatsAppExperience({ mode }: { mode: Mode }) {
  const [step, setStep] = useState<Step>(mode === 'dashboard' ? 4 : 0)
  const [human, setHuman] = useState(false)
  const [modal, setModal] = useState(false)
  const [question, setQuestion] = useState(0)
  const [auto, setAuto] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [videoOpen, setVideoOpen] = useState(false)
  const [demoChoice, setDemoChoice] = useState<'choose' | 'auto' | 'guided'>(mode === 'video' ? 'choose' : 'guided')

  useEffect(() => {
    if (!auto || step >= 4) return
    const id = window.setTimeout(() => setStep(value => Math.min(4, value + 1) as Step), 1350)
    return () => window.clearTimeout(id)
  }, [auto, step])

  useEffect(() => {
    if (mode === 'landing') setVideoOpen(true)
  }, [mode])

  const reset = () => { setAuto(false); setStep(0); setHuman(false) }
  const isProductOnly = mode !== 'landing'
  async function shareVideo() {
    const url = `${window.location.origin}/videos/booking-assistant-demo.mp4`
    try {
      if (navigator.share) await navigator.share({ title: 'Afro Intelligent booking assistant demo', text: 'See how Afro Intelligent helps businesses handle bookings.', url })
      else { await navigator.clipboard.writeText(url); setShareMessage('Video link copied'); window.setTimeout(() => setShareMessage(''), 2500) }
    } catch { /* Visitor closed the native share dialog. */ }
  }
  function watchDemo() {
    if (window.innerWidth < 640) return setVideoOpen(true)
    setStep(0)
    setAuto(true)
    document.getElementById('interactive-demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <main className="min-h-screen bg-[#f7faf8] text-[#10231c]">
      <header className="sticky top-0 z-30 border-b border-[#dcebe2] bg-[#f7faf8]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-black tracking-tight"><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-[#050509]"><Image src="/logo%20afrointelligent2.png" alt="Afro Intelligent" width={80} height={80} className="h-full w-full object-contain" /></span> AFRO INTELLIGENT</Link>
          <div className="hidden items-center gap-6 text-sm font-semibold text-[#496358] md:flex"><a href="#how">How it works</a><a href="#capabilities">Capabilities</a><Link href="/whatsapp/demo">Product demo</Link></div>
          {mode === 'landing' ? <div className="flex items-center gap-2"><Link href="/register?whatsapp=1" className="hidden rounded-full border border-[#a9cbbc] px-4 py-2.5 text-sm font-bold sm:block">Create Account</Link><button onClick={() => setModal(true)} className="rounded-full bg-[#123b2b] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e6145]">Book a Live Demo</button></div> : <Link className="rounded-full border border-[#a9cbbc] px-5 py-2.5 text-sm font-bold" href="/whatsapp">Back to site</Link>}
        </div>
      </header>

      {!isProductOnly && <>
        <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-16 lg:grid-cols-[.9fr_1.1fr] lg:px-8 lg:pb-24 lg:pt-24">
          <div className="flex flex-col justify-center">
            <p className="mb-5 flex items-center gap-2 text-xs font-black tracking-[.18em] text-[#17844f]"><span className="h-2 w-2 rounded-full bg-[#22c55e]" /> AFRO INTELLIGENT × WHATSAPP AUTOMATION</p>
            <h1 className="max-w-xl text-5xl font-black leading-[.96] tracking-[-.06em] text-[#10231c] sm:text-6xl xl:text-7xl">Never Miss<br /><span className="text-[#17844f]">a Client.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#547064]">Automatically turn customer conversations into bookings, qualified leads, quotes, payment requests and follow-ups.</p>
            <div className="mt-8 flex flex-wrap gap-3"><button onClick={watchDemo} className="inline-flex items-center gap-2 rounded-full bg-[#17844f] px-6 py-3.5 font-bold text-white shadow-lg shadow-green-900/15"><Play className="h-4 w-4 fill-current" /> Watch Demo</button><Link href="/register?whatsapp=1" className="rounded-full border border-[#a9cbbc] bg-white px-6 py-3.5 font-bold">Create Your Workspace</Link><button onClick={() => setModal(true)} className="rounded-full px-3 py-3.5 text-sm font-bold text-[#17844f]">Book a Live Demo</button></div>
            <p className="mt-7 flex items-center gap-2 text-sm font-semibold text-[#547064]"><ShieldCheck className="h-4 w-4 text-[#17844f]" /> You stay in control. Take over any conversation.</p>
          </div>
          <div id="booking-assistant-video" className="relative overflow-hidden rounded-[28px] border border-[#c7e0d1] bg-[#123b2b] shadow-2xl shadow-[#123b2b]/15"><video className="aspect-[16/11] w-full bg-black object-contain" controls playsInline preload="metadata"><source src="/videos/booking-assistant-demo.mp4" type="video/mp4" />Your browser does not support this video.</video><div className="flex flex-wrap items-center justify-between gap-3 p-4 text-white"><div><p className="text-sm font-black">Booking assistant demo</p><p className="mt-1 text-xs text-white/70">A live look at the booking journey.</p></div><div className="flex gap-2"><button onClick={() => setVideoOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2.5 text-sm font-bold sm:hidden"><Maximize2 className="h-4 w-4" /> Full screen</button><button onClick={shareVideo} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-[#123b2b]"><Share2 className="h-4 w-4" /> Share</button></div></div>{shareMessage && <p className="absolute bottom-16 right-4 rounded-full bg-black/80 px-3 py-2 text-xs font-bold text-white">{shareMessage}</p>}</div>
        </section>
        <section id="interactive-demo" className="border-t border-[#dcebe2] bg-white px-5 py-16 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-black tracking-[.16em] text-[#17844f]">INTERACTIVE DEMO</p><h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-.05em] sm:text-5xl">Watch an enquiry become a paid booking.</h2><p className="mt-3 max-w-xl leading-7 text-[#547064]">A customer asks for a lesson. The assistant qualifies them, offers times, confirms the booking and sends payment—all while your dashboard updates.</p></div><div className="flex gap-2"><button onClick={reset} className="rounded-full border border-[#a9cbbc] px-4 py-2.5 text-sm font-bold">Reset demo</button><button onClick={() => { setStep(0); setAuto(true) }} className="rounded-full bg-[#17844f] px-4 py-2.5 text-sm font-bold text-white">Play animation</button></div></div><ProductDemo step={step} human={human} setHuman={setHuman} onNext={() => setStep(value => Math.min(4, value + 1) as Step)} /></div></section>
        <section className="border-y border-[#dcebe2] bg-white py-6"><div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-12 gap-y-3 px-5 text-sm font-bold text-[#547064]"><span>Respond in seconds</span><span>Capture every opportunity</span><span>Built for South African businesses</span><span>Human when you need it</span></div></section>
        <section id="how" className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><p className="text-sm font-black tracking-[.16em] text-[#17844f]">ONE CONVERSATION. REAL BUSINESS ACTION.</p><h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-.045em] sm:text-5xl">Your next customer won’t always wait.</h2><div className="mt-10 grid gap-4 md:grid-cols-3">{[['1','Customer messages you'],['2','Assistant understands & qualifies'],['3','Your business moves forward']].map(([num,label]) => <div key={num} className="rounded-3xl border border-[#dcebe2] bg-white p-7"><span className="text-4xl font-black text-[#17844f]">{num}</span><p className="mt-8 text-xl font-bold">{label}</p><p className="mt-2 text-sm leading-6 text-[#547064]">From enquiry to a clear next step, without losing momentum.</p></div>)}</div></section>
        <section id="capabilities" className="bg-[#123b2b] px-5 py-20 text-white lg:px-8"><div className="mx-auto max-w-7xl"><p className="text-sm font-black tracking-[.16em] text-[#8fe5b0]">DESIGNED FOR THE WORK THAT SLOWS YOU DOWN</p><div className="mt-8 grid gap-4 md:grid-cols-2">{capabilities.map(([title, copy], index) => <div key={title} className="rounded-3xl border border-white/10 bg-white/[.06] p-7"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#39b96a] font-black">0{index + 1}</div><h3 className="mt-8 text-2xl font-bold">{title}</h3><p className="mt-3 max-w-sm leading-7 text-white/70">{copy}</p></div>)}</div></div></section>
        <section className="mx-auto max-w-4xl px-5 py-20 text-center"><Sparkles className="mx-auto h-7 w-7 text-[#17844f]"/><h2 className="mt-5 text-4xl font-black tracking-[-.05em] sm:text-5xl">One conversation.<br />One new customer.</h2><p className="mx-auto mt-5 max-w-xl text-[#547064]">See how Afro Intelligent can fit the way your business already works.</p><button onClick={() => setModal(true)} className="mt-8 rounded-full bg-[#17844f] px-7 py-4 font-bold text-white">See This For My Business <ArrowRight className="ml-2 inline h-4 w-4" /></button></section>
      </>}

      {isProductOnly && <section className={mode === 'video' ? 'mx-auto max-w-[1500px] px-5 py-8' : 'mx-auto max-w-7xl px-5 py-12 lg:px-8'}><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-black tracking-[.16em] text-[#17844f]">WHATSAPP BUSINESS ASSISTANT</p><h1 className="mt-2 text-4xl font-black tracking-[-.05em]">{mode === 'video' ? 'See the booking journey.' : 'Demo Driving Academy'}</h1><p className="mt-2 max-w-2xl text-[#547064]">Choose how you want to experience the conversation from first message to payment.</p></div>{demoChoice !== 'choose' && <button onClick={() => { reset(); setDemoChoice('choose') }} className="rounded-full border px-4 py-2 text-sm font-bold">Choose another demo</button>}</div>{mode === 'video' && demoChoice === 'choose' ? <div className="grid gap-5 md:grid-cols-2"><button onClick={() => { reset(); setAuto(true); setDemoChoice('auto') }} className="rounded-[30px] bg-[#123b2b] p-8 text-left text-white shadow-xl transition hover:-translate-y-1"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#39b96a]"><Play className="h-5 w-5 fill-current" /></span><h2 className="mt-8 text-3xl font-black">Watch it happen</h2><p className="mt-3 max-w-sm leading-7 text-white/70">Sit back and watch every customer message, booking update and payment appear automatically.</p><span className="mt-8 inline-flex items-center gap-2 font-bold text-[#8fe5b0]">Play animated journey <ArrowRight className="h-4 w-4" /></span></button><button onClick={() => { reset(); setDemoChoice('guided') }} className="rounded-[30px] border border-[#c7e0d1] bg-white p-8 text-left shadow-xl transition hover:-translate-y-1"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e1f7e9] text-[#17844f]"><ChevronRight className="h-5 w-5" /></span><h2 className="mt-8 text-3xl font-black">Try it step by step</h2><p className="mt-3 max-w-sm leading-7 text-[#547064]">Click through each stage yourself and see exactly what the customer and business see.</p><span className="mt-8 inline-flex items-center gap-2 font-bold text-[#17844f]">Control the journey <ArrowRight className="h-4 w-4" /></span></button></div> : <><div className="mb-5 flex items-center justify-between rounded-2xl bg-[#eaf8ef] px-5 py-4 text-sm font-bold text-[#1a6f42]"><span>{demoChoice === 'auto' ? 'Animated journey running — messages appear one by one.' : 'Step-by-step mode — use Continue demo or the message buttons.'}</span><span>{Math.min(step + 1, 4)} / 4</span></div><ProductDemo step={step} human={human} setHuman={setHuman} onNext={() => setStep(value => Math.min(4, value + 1) as Step)} large /></>}</section>}
      {videoOpen && <div role="dialog" aria-modal="true" aria-label="Booking assistant video" className="fixed inset-0 z-50 flex flex-col justify-center bg-[#071d14] p-3 sm:p-8"><div className="mx-auto mb-3 flex w-full max-w-6xl items-center justify-between text-white"><p className="text-sm font-bold">Booking assistant demo</p><button onClick={() => setVideoOpen(false)} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-sm font-bold"><X className="h-4 w-4" /> Close video</button></div><div className="mx-auto w-full max-w-6xl"><video className="max-h-[75vh] w-full rounded-2xl bg-black object-contain shadow-2xl" controls autoPlay muted playsInline><source src="/videos/booking-assistant-demo.mp4" type="video/mp4" />Your browser does not support this video.</video><p className="mt-4 text-center text-sm text-[#c7e8d2] sm:hidden">For the best view, rotate your phone sideways.</p></div></div>}
      {modal && <LeadModal question={question} setQuestion={setQuestion} close={() => setModal(false)} />}
    </main>
  )
}

function ProductDemo({ step, human, setHuman, onNext, large = false }: { step: Step; human: boolean; setHuman: (value: boolean) => void; onNext: () => void; large?: boolean }) {
  const visible = Math.min(messages.length, step === 0 ? 1 : step === 1 ? 3 : step === 2 ? 5 : 6)
  const paid = step >= 4
  return <div className={`grid gap-4 ${large ? 'lg:grid-cols-[.9fr_1.1fr]' : 'xl:grid-cols-[.9fr_1.1fr]'}`}>
    <div className="overflow-hidden rounded-[28px] border border-[#c7e0d1] bg-white shadow-2xl shadow-[#123b2b]/10"><div className="flex items-center gap-3 border-b bg-[#f4faf6] p-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#d4f3df] font-black text-[#17844f]">T</span><div><p className="font-bold">Thabo M.</p><p className="text-xs text-[#17844f]">● {human ? 'Human active' : 'AI active'}</p></div><button onClick={() => setHuman(!human)} className="ml-auto rounded-full border border-[#b9d9c7] px-3 py-1.5 text-xs font-bold">{human ? 'Resume AI' : 'Take Over'}</button></div><div className="min-h-[370px] space-y-3 bg-[#f7faf8] p-4">{messages.slice(0, visible).map(([name, text, kind], i) => <div key={i} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-5 shadow-sm ${kind === 'incoming' ? 'bg-white' : 'ml-auto bg-[#d9f8e3]'}`}><p className="mb-1 text-[10px] font-black uppercase tracking-wider text-[#648276]">{name}</p>{text}</div>)}{step === 2 && <div className="ml-auto flex max-w-[88%] flex-wrap justify-end gap-2"><button onClick={onNext} className="rounded-full bg-white px-3 py-2 text-xs font-bold shadow">11:00</button><button onClick={onNext} className="rounded-full bg-white px-3 py-2 text-xs font-bold shadow">14:00</button></div>}{step === 3 && <button onClick={onNext} className="ml-auto flex items-center gap-2 rounded-xl bg-[#17844f] px-4 py-3 text-sm font-bold text-white"><CircleDollarSign className="h-4 w-4" /> Pay Securely — Demo</button>}{paid && <div className="ml-auto rounded-xl bg-[#123b2b] px-4 py-3 text-sm font-bold text-white"><Check className="mr-2 inline h-4 w-4 text-[#8fe5b0]" /> Payment successful</div>}</div></div>
    <div className="rounded-[28px] bg-[#123b2b] p-5 text-white shadow-2xl shadow-[#123b2b]/15"><div className="flex items-center justify-between"><div><p className="text-xs font-black tracking-[.14em] text-[#8fe5b0]">AFRO INTELLIGENT</p><p className="mt-1 text-lg font-bold">Business dashboard</p></div><span className="rounded-full bg-[#39b96a]/20 px-3 py-1 text-xs font-bold text-[#a9efc1]">● AI ONLINE</span></div><div className="mt-5 grid grid-cols-2 gap-3">{[['Leads','12',UserRound],['Bookings','8',CalendarCheck],['Payments','R4,850',CircleDollarSign],['Conversations','34',MessageCircle]].map(([label,value,Icon]) => { const Comp=Icon as typeof UserRound; return <div key={label as string} className="rounded-2xl bg-white/[.08] p-4"><Comp className="h-4 w-4 text-[#8fe5b0]"/><p className="mt-4 text-2xl font-black">{value as string}</p><p className="text-xs text-white/60">{label as string}</p></div>})}</div><div className="mt-4 rounded-2xl bg-white p-5 text-[#10231c]"><div className="flex items-center justify-between"><p className="font-bold">Latest activity</p><BarChart3 className="h-4 w-4 text-[#17844f]"/></div><div className="mt-4 space-y-3 text-sm"><p><span className="text-[#17844f]">09:42</span> — New WhatsApp enquiry</p>{step >= 1 && <p><span className="text-[#17844f]">09:43</span> — Lead captured: Thabo M.</p>}{step >= 2 && <p><span className="text-[#17844f]">09:45</span> — Booking created · Saturday 11:00</p>}{paid && <p className="font-bold text-[#17844f]"><Check className="mr-1 inline h-4 w-4" /> Payment received · Confirmed</p>}</div></div>{!paid && <button onClick={onNext} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#39b96a] py-3 text-sm font-bold">Continue demo <ChevronRight className="h-4 w-4" /></button>}</div>
  </div>
}

function LeadModal({ question, setQuestion, close }: { question: number; setQuestion: (n: number) => void; close: () => void }) {
  const prompts = ['Let’s see what we can automate for you.', 'What’s your first name?', 'What’s your business called?', 'What type of business do you run?', 'What’s your WhatsApp number?', 'You’re in. Thanks for sharing your information — our team will reach out shortly.']
  const last = question === prompts.length - 1
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-[#10231c]/70 p-4 backdrop-blur-sm"><div className="relative w-full max-w-2xl rounded-[32px] bg-[#f7faf8] p-7 shadow-2xl sm:p-12"><button onClick={close} className="absolute right-6 top-5 text-sm font-bold text-[#547064]">Close</button><div className="mb-12 h-1.5 overflow-hidden rounded-full bg-[#dcebe2]"><div className="h-full bg-[#17844f] transition-all" style={{width:`${((question + 1) / prompts.length) * 100}%`}} /></div><p className="text-xs font-black tracking-[.16em] text-[#17844f]">YOUR TAILORED DEMO · {question + 1}/{prompts.length}</p><h2 className="mt-5 text-4xl font-black tracking-[-.05em] sm:text-5xl">{prompts[question]}</h2>{question > 0 && !last && <><input autoFocus aria-label={prompts[question]} className="mt-10 w-full border-b-2 border-[#a9cbbc] bg-transparent py-3 text-2xl outline-none focus:border-[#17844f]" placeholder={question === 3 ? 'e.g. Driving school' : question === 4 ? '+27 ...' : 'Type your answer'} /></>}<button onClick={() => last ? close() : setQuestion(question + 1)} className="mt-12 rounded-full bg-[#17844f] px-7 py-3.5 font-bold text-white">{question === 0 ? 'Let’s Go →' : last ? 'Back to Website' : 'Continue →'}</button></div></div>
}
