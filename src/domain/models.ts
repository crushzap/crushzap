import { z } from "zod";

export type Role = "user" | "admin" | "superadmin" | "betatester";

export interface User {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  role: Role;
  status: "lead" | "active" | "blocked";
  trialUsedCount: number;
  trialLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface Persona {
  id: string;
  userId: string;
  name: string;
  personality: string;
  avatar: string | null;
  responseMode: "text" | "audio" | "both";
  voicePitch: number;
  voiceSpeed: number;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  messagesPerCycle: number;
  personasAllowed: number;
  audioEnabled: boolean;
  active: boolean;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: "active" | "past_due" | "canceled" | "expired" | "trial";
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export interface Conversation {
  id: string;
  userId: string;
  personaId: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  personaId: string;
  direction: "in" | "out";
  type: "text" | "audio";
  content: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
}

export interface WhatsappConfig {
  id: string;
  phoneNumberId: string;
  wabaId: string;
  verifyToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface GrokConfig {
  id: string;
  model: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const WhatsappConfigInput = z.object({
  phoneNumberId: z.string().min(1),
  wabaId: z.string().min(1),
  verifyToken: z.string().min(1),
});

export const GrokConfigInput = z.object({
  model: z.string().min(1),
  enabled: z.boolean().default(true),
});

export const PersonaInput = z.object({
  personality: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().nullable(),
  responseMode: z.enum(["text", "audio", "both"]),
  voicePitch: z.number().min(0).max(100),
  voiceSpeed: z.number().min(0).max(100),
  prompt: z.string().min(1),
});

