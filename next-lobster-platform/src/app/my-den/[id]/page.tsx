'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '@/store/useStore';
import { Lobster, Conversation } from '@/types';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { LobsterSprite } from '@/components/lobster/LobsterSprite';
import { BackButton } from '@/components/ui/BackButton';
import { hasConfiguredProvider } from '@/lib/agentProvider';

const CONNECTED_LOBSTER_ID = 'lobster-001';

type ChatMessage = { role: 'user' | 'lobster'; content: string };

export default function LobsterChatPage() {
  const params = useParams();
  const router = useRouter();
  const lobsterId = params.id as string;
  const { lobsters, addConversation } = useStore();

  const lobster = lobsters.find((l: Lobster) => l.id === lobsterId);
  const isGatewayEnabled = lobsterId === CONNECTED_LOBSTER_ID;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lobster) {
      setMessages(
        lobster.conversations.map((c: Conversation) => ({
          role: c.role as 'user' | 'lobster',
          content: c.content,
        }))
      );
    }
  }, [lobster]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isTyping && displayedText.length < (messages[messages.length - 1]?.content.length || 0)) {
      const timer = setTimeout(() => {
        setDisplayedText((prev) => messages[messages.length - 1]?.content.slice(0, prev.length + 1) || '');
      }, 20);
      return () => clearTimeout(timer);
    }

    if (!isTyping) {
      setDisplayedText('');
    }
  }, [isTyping, displayedText, messages]);

  const buildGatewayHistory = () => {
    return messages.map((message) => ({
      role: message.role === 'lobster' ? 'assistant' : 'user',
      content: message.content,
    }));
  };

  const appendAssistantMessage = (content: string) => {
    setMessages((prev) => [...prev, { role: 'lobster', content }]);
    addConversation(lobsterId, { role: 'lobster', content });
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !lobster || isTyping) return;

    const userMessage = inputValue.trim();
    setErrorMessage('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    addConversation(lobsterId, { role: 'user', content: userMessage });
    setInputValue('');
    setIsTyping(true);

    if (!isGatewayEnabled) {
      appendAssistantMessage(
        'This agent is not connected to a live runtime yet. Use a configured OpenClaw gateway agent or complete this agent setup before chatting.'
      );
      setIsTyping(false);
      return;
    }

    try {
      const response = await fetch(`/api/lobsters/${lobsterId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          messages: buildGatewayHistory(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'Request failed');
      }

      appendAssistantMessage(data.reply || 'No reply received.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const fallback = `连接 OpenClaw 失败：${message}`;
      appendAssistantMessage(fallback);
      setErrorMessage(fallback);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!lobster) {
    return (
      <div className="text-center py-16">
        <h2 className="font-pixel text-2xl text-pixel-black">Lobster not found</h2>
        <PixelButton onClick={() => router.push('/my-den')} className="mt-4">
          Back to Lobster Den
        </PixelButton>
      </div>
    );
  }

  const providerConfigured = hasConfiguredProvider(lobster);
  const providerStatusLabel = providerConfigured ? '已配置供应商' : '未配置供应商';

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-6 mt-6"
      >
        <BackButton href="/" />
        <div className="flex items-center gap-3 flex-1">
          <div className="relative shrink-0" title={providerStatusLabel}>
            <LobsterSprite
              lobster={lobster}
              size="md"
              showProviderStatus
              providerConfigured={providerConfigured}
            />
          </div>
          <div>
            <h1 className="font-pixel text-2xl text-pixel-black">{lobster.name}</h1>
            <p className="font-pixel text-sm text-pixel-black/60">{lobster.role}</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="rpg-dialog relative"
      >
        <div className="absolute top-0 left-0 w-6 h-6 bg-pixel-white border-r-2 border-b-2 border-pixel-black" />
        <div className="absolute top-0 right-0 w-6 h-6 bg-pixel-white border-l-2 border-b-2 border-pixel-black" />
        <div className="absolute bottom-0 left-0 w-6 h-6 bg-pixel-white border-r-2 border-t-2 border-pixel-black" />
        <div className="absolute bottom-0 right-0 w-6 h-6 bg-pixel-white border-l-2 border-t-2 border-pixel-black" />

        <div className="p-6 min-h-[600px] max-h-[800px] overflow-y-auto">
          <AnimatePresence>
            {messages.map((msg, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 }}
                className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
              >
                <div className={`font-pixel text-xs mb-1 ${msg.role === 'user' ? 'text-pixel-blue' : 'text-pixel-yellow'}`}>
                  {msg.role === 'user' ? 'YOU' : lobster.name}
                </div>

                <div
                  className={`
                    inline-block
                    max-w-[80%]
                    px-4 py-3
                    font-pixel text-lg
                    leading-relaxed
                    whitespace-pre-wrap
                    ${msg.role === 'user'
                      ? 'bg-pixel-blue text-pixel-white border-4 border-pixel-black ml-auto'
                      : 'bg-pixel-white text-pixel-black border-4 border-pixel-black'}
                  `}
                  style={{ boxShadow: '4px 4px 0px 0px #101010' }}
                >
                  {msg.role === 'lobster' && index === messages.length - 1 && isTyping ? (
                    <>
                      {displayedText}
                      <span className="typewriter-cursor">_</span>
                    </>
                  ) : (
                    msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    )
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-left mb-4">
              <div className="inline-block bg-pixel-white text-pixel-black border-4 border-pixel-black px-4 py-2 font-pixel">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>
                  .
                </span>
                <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>
                  .
                </span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t-4 border-pixel-white p-4 bg-pixel-black/50">
          <div className="flex gap-3">
            <PixelInput
              value={inputValue}
              onChange={setInputValue}
              onKeyDown={handleKeyDown}
              placeholder={isGatewayEnabled ? '向 OpenClaw Main Agent 提问...' : 'Enter message...'}
              className="flex-1"
              disabled={isTyping}
            />
            <PixelButton onClick={() => void handleSend()} disabled={!inputValue.trim() || isTyping} variant="primary">
              Send
            </PixelButton>
          </div>
          <p className="font-pixel text-xs text-pixel-white/60 mt-2 text-center">
            {isGatewayEnabled ? '消息会先发到本项目后端，再由后端转发到 OpenClaw Gateway' : 'Press Enter to send'}
          </p>
          {errorMessage && (
            <p className="font-pixel text-xs text-pixel-yellow mt-2 text-center whitespace-pre-wrap">{errorMessage}</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
