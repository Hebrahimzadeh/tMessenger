'use client';

export function useGemini() {
  const generate = async (prompt: string, systemInstruction?: string): Promise<string> => {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemInstruction }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'متأسفانه ارتباط با هوش مصنوعی با خطا مواجه شد. لطفاً دوباره تلاش کنید.');
    }
    return data.text as string;
  };

  return { generate };
}
