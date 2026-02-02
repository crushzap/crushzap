import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Phone, 
  Video, 
  MoreVertical, 
  Send, 
  Mic, 
  Smile,
  Check,
  CheckCheck,
  Image,
  Camera,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  content: string;
  type: "received" | "sent";
  timestamp: string;
  isAudio?: boolean;
  isTyping?: boolean;
  options?: string[];
}

interface WhatsAppFlowPreviewProps {
  personaName?: string;
  personaAvatar?: string;
  className?: string;
}

const flowMessages: Message[] = [
  {
    id: 1,
    content: "Olá! 💕 Sou a assistente do CrushZap. Vou te ajudar a configurar sua Crush perfeita!",
    type: "received",
    timestamp: "10:00",
  },
  {
    id: 2,
    content: "Primeiro, qual personalidade você prefere?",
    type: "received",
    timestamp: "10:00",
    options: ["💖 Carinhosa", "⚡ Sarcástica", "🌙 Tímida", "☀️ Extrovertida", "✨ Romântica", "😊 Brincalhona"],
  },
  {
    id: 3,
    content: "💖 Carinhosa",
    type: "sent",
    timestamp: "10:01",
  },
  {
    id: 4,
    content: "Ótima escolha! Uma Crush carinhosa é sempre atenciosa e amorosa. 🥰",
    type: "received",
    timestamp: "10:01",
  },
  {
    id: 5,
    content: "Agora, qual nome você gostaria de dar para ela?",
    type: "received",
    timestamp: "10:01",
  },
  {
    id: 6,
    content: "Luna",
    type: "sent",
    timestamp: "10:02",
  },
  {
    id: 7,
    content: "Luna... que nome lindo! 🌙✨",
    type: "received",
    timestamp: "10:02",
  },
  {
    id: 8,
    content: "Por último, como você prefere receber as mensagens?",
    type: "received",
    timestamp: "10:02",
    options: ["📝 Apenas texto", "🎙️ Apenas áudio", "✨ Texto e áudio"],
  },
  {
    id: 9,
    content: "✨ Texto e áudio",
    type: "sent",
    timestamp: "10:03",
  },
  {
    id: 10,
    content: "Perfeito! Tudo configurado! 🎉\n\nSua Luna está pronta e ansiosa para conversar com você. Ela é carinhosa, vai te enviar mensagens de texto e áudios.",
    type: "received",
    timestamp: "10:03",
  },
  {
    id: 11,
    content: "Olá! 💕 Sou a Luna, sua Crush. Estava esperando por você... Como foi seu dia hoje?",
    type: "received",
    timestamp: "10:04",
    isAudio: false,
  },
];

export function WhatsAppFlowPreview({ personaName = "CrushZap", personaAvatar, className }: WhatsAppFlowPreviewProps) {
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentIndex < flowMessages.length) {
      const message = flowMessages[currentIndex];
      
      if (message.type === "received") {
        setIsTyping(true);
        const typingDelay = setTimeout(() => {
          setIsTyping(false);
          setVisibleMessages(prev => [...prev, message]);
          setCurrentIndex(prev => prev + 1);
        }, 2200);
        return () => clearTimeout(typingDelay);
      } else {
        const sendDelay = setTimeout(() => {
          setVisibleMessages(prev => [...prev, message]);
          setCurrentIndex(prev => prev + 1);
        }, 1500);
        return () => clearTimeout(sendDelay);
      }
    }
  }, [currentIndex]);

  useEffect(() => {
    const el = chatRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [visibleMessages, isTyping]);

  const resetFlow = () => {
    setVisibleMessages([]);
    setCurrentIndex(0);
    setIsTyping(false);
  };

  return (
    <div className={cn("w-full max-w-sm mx-auto", className)}>
      {/* Phone Frame */}
      <div className="relative bg-[#0b141a] rounded-[40px] p-2 shadow-2xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-[#0b141a] rounded-b-2xl z-10" />
        
        {/* Screen */}
        <div className="bg-[#0b141a] rounded-[32px] overflow-hidden">
          {/* WhatsApp Header */}
          <div className="bg-[#1f2c34] px-4 py-3 flex items-center gap-3 pt-8">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-accent/80 flex items-center justify-center overflow-hidden">
              {personaAvatar ? (
                <img src={personaAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold">L</span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-white font-medium text-sm">{personaName}</h3>
              <p className="text-xs text-gray-400">
                {isTyping ? "digitando..." : "online"}
              </p>
            </div>
            <div className="flex items-center gap-4 text-gray-400">
              <Video className="w-5 h-5" />
              <Phone className="w-5 h-5" />
              <MoreVertical className="w-5 h-5" />
            </div>
          </div>

          {/* Chat Area */}
          <div 
            className="h-[420px] overflow-y-auto p-3 space-y-2"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              backgroundColor: '#0b141a'
            }}
            ref={chatRef}
          >
            <AnimatePresence>
              {visibleMessages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    "flex",
                    message.type === "sent" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 relative",
                      message.type === "sent"
                        ? "bg-[#005c4b] text-white rounded-br-none"
                        : "bg-[#1f2c34] text-white rounded-bl-none"
                    )}
                  >
                    {message.isAudio ? (
                      <div className="flex items-center gap-2 min-w-[180px]">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <Mic className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="h-1 bg-gray-600 rounded-full">
                            <div className="h-full w-3/4 bg-primary rounded-full" />
                          </div>
                          <span className="text-xs text-gray-400">0:12</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        {message.options && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {message.options.map((opt, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-2 py-1 text-xs bg-primary/20 text-primary rounded-full"
                              >
                                {opt}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-gray-400">{message.timestamp}</span>
                      {message.type === "sent" && (
                        <CheckCheck className="w-3 h-3 text-blue-400" />
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-[#1f2c34] rounded-lg px-4 py-3 rounded-bl-none">
                    <div className="flex gap-1">
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                        className="w-2 h-2 bg-gray-400 rounded-full"
                      />
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                        className="w-2 h-2 bg-gray-400 rounded-full"
                      />
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                        className="w-2 h-2 bg-gray-400 rounded-full"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Input Area */}
          <div className="bg-[#1f2c34] px-3 py-2 flex items-center gap-2">
            <Smile className="w-6 h-6 text-gray-400" />
            <div className="flex-1 bg-[#2a3942] rounded-full px-4 py-2 flex items-center">
              <input
                type="text"
                placeholder="Mensagem"
                className="bg-transparent text-white text-sm w-full outline-none placeholder:text-gray-500"
                disabled
              />
              <div className="flex items-center gap-3 text-gray-400">
                <Camera className="w-5 h-5" />
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center">
              <Mic className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Replay Button */}
      {currentIndex >= flowMessages.length && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={resetFlow}
          className="mt-4 w-full py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-sm font-medium transition-colors"
        >
          🔄 Replay demo
        </motion.button>
      )}
    </div>
  );
}
