import type { ComponentType } from 'react';

export type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export interface User {
  name: string;
  username: string;
  phone: string;
  bio: string;
}

export interface InlineButton {
  id: number;
  label: string;
  action: string;
}

export interface Message {
  id: number;
  text: string;
  sender: 'me' | 'them';
  time: string;
  inlineButtons?: InlineButton[];
}

export interface Chat {
  id: string | number;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  online: boolean;
  sharedPlatforms: string[];
  unread: number;
  isBot?: boolean;
  messages: Message[];
}

export interface ReplyTo {
  sender: string;
  text: string;
}

export interface Comment {
  id: number;
  text: string;
  sender?: string;
  time?: string;
  isSystem?: boolean;
  isAction?: boolean;
  status?: string;
  replyTo?: ReplyTo | null;
}

export interface Card {
  id: number;
  title: string;
  author: string;
  avatar: string;
  time: string;
  desc: string;
  hasImage: boolean;
  isCurated: boolean;
  comments: Comment[];
  status?: 'pending' | 'closed' | null;
  requester?: string | null;
}

export interface FormLabels {
  title: string;
  desc: string;
  image?: string;
  descPlaceholder?: string;
  commentPlaceholder?: string;
}

export interface MiniappConfig {
  title: string;
  placeholder: string;
  systemInstruction?: string;
}

export interface Platform {
  id: number;
  name: string;
  creator: string;
  members: number;
  icon: IconComponent;
  description: string;
  heroText: string;
  leftSide: string;
  rightSide: string;
  formLabels: FormLabels;
  actionLabel?: string;
  unreadCount: number;
  miniappConfig?: MiniappConfig | null;
  cards: Card[];
  isDraft?: boolean;
  curatedCards?: Card[];
}

export interface GlobalCommentSeed {
  id: number;
  platformName: string;
  cardTitle: string;
  text: string;
  senderAvatar: string;
  time: string;
  unread: number;
}

export interface Draft {
  id: number;
  platformId: number;
  title: string;
  desc: string;
  hasImage: boolean;
  timestamp: number;
}

export interface AiSuggestion {
  id: number;
  title: string;
  connects: string;
  desc: string;
  heroText?: string;
  leftSide?: string;
  rightSide?: string;
  formLabels?: FormLabels;
  miniappConfig?: MiniappConfig;
}
