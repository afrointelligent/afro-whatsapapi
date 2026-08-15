'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bot, Send, UserRound } from 'lucide-react'

type Conversation = { _id: string; customerPhone: string; customerName?: string; lastMessage?: string; lastMessageAt?: string; unreadCount?: number; automationMode?: 'AI_ACTIVE' | 'HUMAN_ACTIVE' }
type Message = { _id: string; direction: 'inbound' | 'outbound'; content: string; timestamp: string; type?: string }

export default function WhatsAppInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [active, setActive] = useState<Conversation | null>(null)
  const [reply, setReply] = useState('')
  const [notice, setNotice] = useState('')

  async function loadInbox() {
    const response = await fetch('/api/whatsapp/inbox', { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    const next = data.conversations || []
    setConversations(next)
    setActiveId(current => current || next[0]?._id || '')
  }
  async function loadConversation(id: string) {
    if (!id) return
    const response = await fetch(`/api/whatsapp/inbox/${id}`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (response.ok) { setActive(data.conversation); setMessages(data.messages || []) }
  }
  useEffect(() => { loadInbox() }, [])
  useEffect(() => { loadConversation(activeId) }, [activeId])
  useEffect(() => {
    const interval = window.setInterval(() => { loadInbox(); if (activeId) loadConversation(activeId) }, 2500)
    return () => window.clearInterval(interval)
  }, [activeId])
  async function setMode(mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE') {
    if (!activeId) return
    const response = await fetch(`/api/whatsapp/inbox/${activeId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setNotice(data.error || 'Could not update automation mode.')
    setActive(data.conversation); setNotice(mode === 'HUMAN_ACTIVE' ? 'Human takeover is active. Automation will not reply.' : 'AI automation resumed.')
  }
  async function sendReply(event: React.FormEvent) {
    event.preventDefault(); const content = reply.trim(); if (!activeId || !content) return
    setNotice('Sending…')
    const response = await fetch(`/api/whatsapp/inbox/${activeId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setNotice(data.error || 'Message could not be sent.')
    setReply(''); setNotice('Message sent to WhatsApp.'); await loadConversation(activeId); await loadInbox()
  }
  return <main className="min-h-screen bg-[#f4faf6] p-4 text-[#10231c] sm:p-6"><div className="mx-auto max-w-[1500px]"><Link href="/whatsapp/dashboard" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[#17844f]"><ArrowLeft className="h-4 w-4" /> Workspace overview</Link><header className="mb-5 flex items-end justify-between"><div><p className="text-xs font-black tracking-[.17em] text-[#17844f]">WHATSAPP INBOX</p><h1 className="mt-2 text-3xl font-black">Customer conversations</h1></div><p className="text-sm font-bold text-[#547064]">Live polling every 2.5 seconds</p></header><div className="grid min-h-[680px] overflow-hidden rounded-3xl border border-[#dcebe2] bg-white lg:grid-cols-[320px_minmax(0,1fr)_290px]"><aside className="border-b border-[#dcebe2] lg:border-b-0 lg:border-r"><div className="border-b border-[#dcebe2] p-5"><p className="font-black">Conversations</p><p className="mt-1 text-sm text-[#547064]">{conversations.length} visible for your workspace</p></div><div className="max-h-[600px] overflow-auto">{conversations.map(item => <button key={item._id} onClick={() => setActiveId(item._id)} className={`w-full border-b border-[#edf2ee] p-5 text-left ${activeId === item._id ? 'bg-[#effaf2]' : 'hover:bg-[#f8fbf9]'}`}><div className="flex justify-between gap-2"><p className="font-black">{item.customerName || item.customerPhone}</p>{item.unreadCount ? <span className="rounded-full bg-[#17844f] px-2 py-0.5 text-xs font-black text-white">{item.unreadCount}</span> : null}</div><p className="mt-1 text-sm text-[#547064]">{item.customerPhone}</p><p className="mt-3 truncate text-sm text-[#547064]">{item.lastMessage || 'No messages yet'}</p></button>)}{!conversations.length ? <p className="p-5 text-sm text-[#547064]">No real WhatsApp conversations have arrived for this workspace yet.</p> : null}</div></aside><section className="flex min-w-0 flex-col"><div className="border-b border-[#dcebe2] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">{active?.customerName || active?.customerPhone || 'Select a conversation'}</p><p className="text-sm text-[#547064]">{active?.customerPhone || ''}</p></div>{active ? <div className="flex gap-2"><button onClick={() => setMode('HUMAN_ACTIVE')} className="rounded-full border border-[#17844f] px-4 py-2 text-sm font-bold text-[#17844f]">Take Over</button><button onClick={() => setMode('AI_ACTIVE')} className="rounded-full bg-[#17844f] px-4 py-2 text-sm font-bold text-white">Resume AI</button></div> : null}</div></div><div className="flex-1 space-y-3 overflow-auto bg-[#f8fbf9] p-5">{messages.map(message => <div key={message._id} className={`max-w-[82%] rounded-2xl p-4 text-sm leading-6 ${message.direction === 'outbound' ? 'ml-auto bg-[#d9f7e3]' : 'bg-white shadow-sm'}`}><p>{message.content}</p><p className="mt-2 text-xs text-[#547064]">{new Date(message.timestamp).toLocaleString()}</p></div>)}{active && !messages.length ? <p className="text-sm text-[#547064]">No messages stored yet.</p> : null}</div><form onSubmit={sendReply} className="border-t border-[#dcebe2] p-4"><div className="flex gap-3"><input value={reply} onChange={event => setReply(event.target.value)} disabled={!active} placeholder="Reply from Afro Intelligent…" className="min-w-0 flex-1 rounded-xl border border-[#c7e0d1] px-4 py-3 outline-none focus:border-[#17844f]" /><button disabled={!active || !reply.trim()} className="rounded-xl bg-[#17844f] px-4 text-white disabled:opacity-40"><Send className="h-5 w-5" /></button></div>{notice ? <p className="mt-3 text-sm font-bold text-[#547064]">{notice}</p> : null}</form></section><aside className="border-t border-[#dcebe2] bg-[#fbfdfb] p-5 lg:border-l lg:border-t-0"><UserRound className="h-6 w-6 text-[#17844f]" /><h2 className="mt-4 font-black">Customer context</h2><p className="mt-4 text-sm text-[#547064]">Phone</p><p className="font-bold">{active?.customerPhone || '—'}</p><p className="mt-5 text-sm text-[#547064]">Automation status</p><p className="mt-1 inline-flex items-center gap-2 font-bold"><Bot className="h-4 w-4 text-[#17844f]" />{active?.automationMode === 'HUMAN_ACTIVE' ? 'Human active' : 'AI active'}</p><p className="mt-8 rounded-2xl bg-[#fff7d9] p-4 text-sm leading-6">Inbox displays only messages saved for your current tenant.</p></aside></div></div></main>
}
