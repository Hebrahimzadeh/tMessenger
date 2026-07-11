'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AiSuggestion, Platform } from '@/lib/types';
import { CURRENT_USER } from '@/lib/data/seed';
import { Layers } from '@/components/icons';
import { useGemini } from '@/hooks/useGemini';
import { usePlatforms } from '@/hooks/usePlatforms';
import { useUI } from '@/hooks/useUI';

type AiFlowState = 'initial' | 'processing' | 'suggestions' | 'confirmation' | 'upgrade_offer' | 'upgrade_success';

const processingMessages = [
  'دارم به دغدغه‌ات فکر می‌کنم...',
  'مسیر حل این مسئله رو تو ذهنم کشیدم...',
  'دارم می‌گردم ببینم کجاها می‌تونیم آدم‌ها رو به هم وصل کنیم تا کار دربیاد...',
];

const mockSuggestions: AiSuggestion[] = [
  {
    id: 1,
    title: 'جمعِ تامین وسایل و بانیان',
    connects: 'خیرین ↔️ خادمین اجرایی',
    desc: 'تو این بستر، کسانی که وسیله دارن رو وصل می‌کنیم به شما که وسط میدان هستید.',
    heroText: 'دست در دست هم برای حل مشکلات',
    leftSide: 'خیرین',
    rightSide: 'جهادگران',
    formLabels: {
      title: 'عنوان',
      desc: 'توضیحات و نیازمندی‌ها',
      image: 'تصویر',
      descPlaceholder: 'جزئیات کاری که نیاز دارید را اینجا بنویسید...',
      commentPlaceholder: 'پاسخ یا پیشنهاد کمک خود را بنویسید...',
    },
    miniappConfig: {
      title: 'دستیار تامین',
      placeholder: 'مثلاً بگویید به ۳ عدد چادر نیاز داریم...',
      systemInstruction: 'یک متن مناسب برای درخواست کالا یا نیروی جهادی تنظیم کن.',
    },
  },
];

const AI_PLATFORM_SYSTEM_PROMPT = `شما دستیار هوشمند و موتور طراح ساختارهای اجتماعی (بسترها) هستید. بر اساس دغدغه یا نیازمندی کاربر، باید یک ساختار بستر (پلتفرم کوچک) طراحی کنید.
خروجی شما باید منحصراً یک آرایه JSON شامل یک پیشنهاد (شیء) باشد، بدون هیچ متن اضافی. ساختار هر شیء:
[
  {
    "id": 1,
    "title": "نام بستر (کوتاه و جذاب)",
    "connects": "طرفین بستر (مثلاً: نیازمندان ↔ متخصصین)",
    "desc": "توضیح کامل بستر و هدف آن",
    "heroText": "یک جمله حماسی و الهام‌بخش برای بالای بستر",
    "leftSide": "نام گروه اول (سمت عرضه)",
    "rightSide": "نام گروه دوم (سمت تقاضا)",
    "formLabels": {
      "title": "عنوان لیبل فیلد اصلی",
      "desc": "عنوان لیبل فیلد توضیحات",
      "image": "عنوان لیبل فایل پیوست",
      "descPlaceholder": "متن کمکی بسیار مرتبط برای فیلد توضیحات فرم. حتما روان و مرتبط باشد. (از عبارات نامفهوم مانند «عنوان عمومی» استفاده نکنید.)",
      "commentPlaceholder": "متن کمکی بسیار مرتبط برای نظرات در این بستر (مثلاً: پیشنهاد کمک خود را بنویسید... یا پاسخ خود را بنویسید...)"
    },
    "miniappConfig": {
      "title": "عنوان دستیار هوشمند بستر",
      "placeholder": "متن کمکی برای مینی‌اپ که کاربر را راهنمایی می‌کند چه بنویسد",
      "systemInstruction": "پرامپت برای هوش مصنوعی مینی‌اپ تا ورودی را به متنی شکیل برای انتشار تبدیل کند."
    }
  }
]`;

interface AiCopilotContextValue {
  aiFlowState: AiFlowState;
  aiInputText: string;
  processingMessageIdx: number;
  selectedSuggestion: AiSuggestion | null;
  generatedSuggestions: AiSuggestion[];
  setAiInputText: (text: string) => void;
  startFlow: (inputText: string) => void;
  beginProcessing: () => void;
  chooseSuggestion: (sug: AiSuggestion) => void;
  createPlatform: () => void;
  activateMiniapp: () => void;
  closeModal: () => void;
}

const AiCopilotContext = createContext<AiCopilotContextValue | null>(null);

export function AiCopilotProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { generate } = useGemini();
  const { addPlatform, setMiniappConfig, getPlatform } = usePlatforms();
  const { openAiModal, closeAiModal } = useUI();

  const [aiFlowState, setAiFlowState] = useState<AiFlowState>('initial');
  const [aiInputText, setAiInputText] = useState('');
  const [processingMessageIdx, setProcessingMessageIdx] = useState(0);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AiSuggestion | null>(null);
  const [generatedSuggestions, setGeneratedSuggestions] = useState<AiSuggestion[]>([]);
  const [createdPlatformId, setCreatedPlatformId] = useState<number | null>(null);

  useEffect(() => {
    if (aiFlowState !== 'processing') return;

    const interval = setInterval(() => {
      setProcessingMessageIdx((prev) => (prev >= processingMessages.length - 1 ? prev : prev + 1));
    }, 1800);

    const generatePlatform = async () => {
      try {
        const rawText = await generate(aiInputText, AI_PLATFORM_SYSTEM_PROMPT);
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          setGeneratedSuggestions(JSON.parse(jsonMatch[0]));
        } else {
          const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          setGeneratedSuggestions(JSON.parse(cleanText));
        }
      } catch (err) {
        console.error('AI Generation failed:', err);
        setGeneratedSuggestions(mockSuggestions);
      } finally {
        setAiFlowState('suggestions');
      }
    };

    generatePlatform();
    return () => clearInterval(interval);
  }, [aiFlowState, aiInputText, generate]);

  const startFlow = (inputText: string) => {
    setAiInputText(inputText);
    setAiFlowState('processing');
    setProcessingMessageIdx(0);
    openAiModal();
  };

  const beginProcessing = () => {
    setAiFlowState('processing');
    setProcessingMessageIdx(0);
  };

  const chooseSuggestion = (sug: AiSuggestion) => {
    setSelectedSuggestion(sug);
    setAiFlowState('confirmation');
  };

  const createPlatform = () => {
    if (!selectedSuggestion) return;
    const newPlatformId = Date.now();
    const newPlatform: Platform = {
      id: newPlatformId,
      name: selectedSuggestion.title,
      creator: CURRENT_USER.username,
      members: 1,
      icon: Layers,
      description: selectedSuggestion.desc,
      heroText: selectedSuggestion.heroText || 'به جمع جدید خوش آمدید!',
      leftSide: selectedSuggestion.leftSide || 'سمت عرضه',
      rightSide: selectedSuggestion.rightSide || 'سمت تقاضا',
      formLabels: selectedSuggestion.formLabels || {
        title: 'عنوان',
        desc: 'توضیحات',
        image: 'تصویر',
        descPlaceholder: 'جزئیات بیشتری که باید بدانند...',
        commentPlaceholder: 'پاسخ یا پیشنهاد خود را بنویسید...',
      },
      miniappConfig: selectedSuggestion.miniappConfig || null,
      unreadCount: 0,
      curatedCards: [],
      isDraft: true,
      cards: [
        {
          id: Date.now() + 1,
          title: 'روشن کردن چراغ اول',
          author: CURRENT_USER.name,
          avatar: CURRENT_USER.name.charAt(0),
          time: 'همین الان',
          desc: aiInputText,
          hasImage: false,
          isCurated: false,
          comments: [],
        },
      ],
    };
    addPlatform(newPlatform);
    setCreatedPlatformId(newPlatformId);
    setAiFlowState('upgrade_offer');
    router.push('/platforms/' + newPlatformId);
  };

  const activateMiniapp = () => {
    if (createdPlatformId === null) return;
    const platform = getPlatform(createdPlatformId);
    if (!platform) return;
    const config = selectedSuggestion?.miniappConfig || {
      title: `دستیار هوشمند ${platform.name}`,
      placeholder: `ایده یا خواسته خود برای ثبت در ${platform.name} را بنویسید...`,
      systemInstruction: `تو دستیار هوشمند ثبت کارت در بستر ${platform.name} هستی. بر اساس ورودی کاربر، یک متن نهایی، شکیل و منظم متناسب با نیازها و ارزش‌های این بستر به زبان فارسی بنویس. خروجی باید فقط شامل متن نهایی برای ثبت در کارت باشد و هیچ بخش یا حاشیه دیگری نداشته باشد.`,
    };
    setMiniappConfig(createdPlatformId, config);
    setAiFlowState('upgrade_success');
  };

  const closeModal = () => {
    closeAiModal();
    setTimeout(() => setAiFlowState('initial'), 300);
  };

  return (
    <AiCopilotContext.Provider
      value={{
        aiFlowState,
        aiInputText,
        processingMessageIdx,
        selectedSuggestion,
        generatedSuggestions,
        setAiInputText,
        startFlow,
        beginProcessing,
        chooseSuggestion,
        createPlatform,
        activateMiniapp,
        closeModal,
      }}
    >
      {children}
    </AiCopilotContext.Provider>
  );
}

export function useAiCopilot() {
  const ctx = useContext(AiCopilotContext);
  if (!ctx) throw new Error('useAiCopilot must be used within an AiCopilotProvider');
  return ctx;
}
