import React, { useEffect, useRef, useState } from 'react';
import { Bot, CheckCircle2, Cpu, Send, Sparkles, UserCheck, Zap } from 'lucide-react';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
}

export function AiAssistantCopilot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_intro',
      sender: 'bot',
      text: 'Hello, Administrator! I am your DT Copilot and Telegram Bot Assistant. You can ask me to set up your admin account, register schools, check attendance, or guide you through platform operations.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, loading]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputVal.trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setLoading(true);

    // Simulate intelligent bot response with ChatGPT-style streaming typing effect
    setTimeout(() => {
      setLoading(false);
      let fullResponse = '';
      const lower = query.toLowerCase();

      if (lower.includes('account') || lower.includes('setup') || lower.includes('admin')) {
        fullResponse =
          'To set up your first admin account, you can either use the Founding School Admin registration at /register using your School Code, or provision your institution directly from the Platform Owner dashboard under "Create School & Admin". Your account will immediately activate full administrative privileges for your tenant.';
      } else if (lower.includes('telegram') || lower.includes('bot') || lower.includes('link')) {
        fullResponse =
          'The universal Telegram bot connects all 5 user roles (Students, Parents, Teachers, School Admins, Platform Owner) with 1-click magic sign-in links and guided slash commands like /start, /link, /idcard, and /results. You can configure your bot token in Owner Telegram Settings.';
      } else if (lower.includes('student') || lower.includes('register')) {
        fullResponse =
          'School admins can register students with photo passports and auto-generated accounts either via the School Admin portal ("Register Student") or directly through the Telegram bot by sending /registerstudent.';
      } else {
        fullResponse = `I received your request regarding "${query}". As your DT Copilot, I am ready to assist with student registration, attendance tracking, term result publication, and secure multi-tenant operations. How else can I help set up your workspace today?`;
      }

      // ChatGPT style streaming word-by-word / character-by-character typing effect
      let charIndex = 0;
      setStreamingText('');
      const botMsgId = `bot_${Date.now()}`;

      const interval = setInterval(() => {
        if (charIndex < fullResponse.length) {
          setStreamingText((prev) => prev + fullResponse.charAt(charIndex));
          charIndex++;
        } else {
          clearInterval(interval);
          setStreamingText('');
          setMessages((prev) => [
            ...prev,
            {
              id: botMsgId,
              sender: 'bot',
              text: fullResponse,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      }, 16); // Smooth typing speed
    }, 1100);
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputVal(prompt);
  };

  return (
    <Card className="border-blue-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-[#1E3A8A]">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-[#1E3A8A]">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-base">DT Bot &amp; AI Assistant Copilot</CardTitle>
              <CardDescription className="text-xs">
                Interactive assistant featuring ChatGPT-style streaming responses and animated loading indicators.
              </CardDescription>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI Ready</span>
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex flex-col h-[420px]">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-2.5 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  m.sender === 'user'
                    ? 'bg-[#1E3A8A] text-white'
                    : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xs'
                }`}
              >
                {m.sender === 'user' ? <UserCheck className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                  m.sender === 'user'
                    ? 'bg-[#1E3A8A] text-white rounded-tr-none'
                    : 'bg-slate-100 text-[#0F172A] rounded-tl-none border border-slate-200/60'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p
                  className={`mt-1 text-[10px] tabular-nums ${
                    m.sender === 'user' ? 'text-blue-200 text-right' : 'text-slate-400'
                  }`}
                >
                  {m.timestamp}
                </p>
              </div>
            </div>
          ))}

          {/* Active Streaming Text */}
          {streamingText ? (
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xs">
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-tl-none bg-slate-100 px-4 py-3 text-xs leading-relaxed text-[#0F172A] border border-slate-200/60 shadow-xs">
                <p className="whitespace-pre-wrap">{streamingText}</p>
                <span className="inline-block h-3 w-1.5 ml-0.5 bg-blue-600 animate-pulse" />
              </div>
            </div>
          ) : null}

          {/* Loading Indicator ("Moving something" / Bouncing Dots) */}
          {loading && !streamingText ? (
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xs animate-bounce">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-tl-none bg-slate-100 px-4 py-3 text-xs text-slate-600 border border-slate-200/60 flex items-center gap-2">
                <span className="font-medium text-[#1E3A8A]">DT Copilot is thinking</span>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce" />
                </div>
              </div>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Pills */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/80 flex items-center gap-2 overflow-x-auto text-[11px]">
          <span className="text-slate-500 shrink-0 font-medium">Quick prompt:</span>
          {[
            'How do I setup my admin account?',
            'How does the Telegram bot work?',
            'How to register students with photos?',
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleQuickPrompt(prompt)}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Ask AI Copilot how to set up your account or bot..."
            className="flex-1 text-xs"
            disabled={loading}
          />
          <Button type="submit" size="sm" disabled={loading || !inputVal.trim()} className="shrink-0">
            <Send className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            <span>Send</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
