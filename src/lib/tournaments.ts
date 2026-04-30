export function normalizeWhatsAppUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith('https://chat.whatsapp.com/')) return v;
  if (v.startsWith('chat.whatsapp.com/')) return `https://${v}`;
  return null;
}

export type GeneratedMatchDraft = {
  round_label: string;
  court_label: string;
  team_a_label: string;
  team_b_label: string;
};

export function generateRoundRobinDrafts(playerNames: string[]): GeneratedMatchDraft[] {
  if (playerNames.length < 2) return [];

  const cleaned = playerNames.map((p) => p.trim()).filter(Boolean);
  const drafts: GeneratedMatchDraft[] = [];

  for (let i = 0; i < cleaned.length; i += 1) {
    for (let j = i + 1; j < cleaned.length; j += 1) {
      const idx = drafts.length;
      drafts.push({
        round_label: `Round ${i + 1}`,
        court_label: `Court ${((idx % 4) + 1).toString()}`,
        team_a_label: cleaned[i],
        team_b_label: cleaned[j],
      });
    }
  }
  return drafts;
}
