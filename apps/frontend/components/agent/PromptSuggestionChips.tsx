"use client";

export interface PromptSuggestionChip {
  id: string;
  label: string;
  promptText: string;
  category: "search" | "orders" | "escrow" | "help";
  icon?: string;
}

/** Starter prompts shown to first-time buyers, one per category. */
export const DEFAULT_PROMPT_SUGGESTIONS: PromptSuggestionChip[] = [
  {
    id: "search",
    category: "search",
    label: "Keyboards under 50 USDC",
    promptText: "Find mechanical keyboards under 50 USDC",
  },
  {
    id: "orders",
    category: "orders",
    label: "Check order #123",
    promptText: "Check order status for #123",
  },
  {
    id: "escrow",
    category: "escrow",
    label: "My pending escrows",
    promptText: "Which of my escrows are still waiting to be released?",
  },
  {
    id: "help",
    category: "help",
    label: "How does the agent work?",
    promptText: "How do you buy things on my behalf?",
  },
];

export interface PromptSuggestionChipsProps {
  /** Called with the chip that was clicked. */
  onSelect: (chip: PromptSuggestionChip) => void;
  suggestions?: PromptSuggestionChip[];
  /** Fades the list out and takes it out of the tab order. */
  hidden?: boolean;
}

/**
 * Horizontally scrollable starter prompts for the agent chat (#931).
 */
export function PromptSuggestionChips({
  onSelect,
  suggestions = DEFAULT_PROMPT_SUGGESTIONS,
  hidden = false,
}: PromptSuggestionChipsProps) {
  return (
    <ul
      className={`prompt-chips${hidden ? " prompt-chips--hidden" : ""}`}
      aria-label="Suggested prompts"
      aria-hidden={hidden || undefined}
    >
      {suggestions.map((chip) => (
        <li key={chip.id}>
          <button
            type="button"
            className="prompt-chip"
            data-category={chip.category}
            tabIndex={hidden ? -1 : undefined}
            onClick={() => onSelect(chip)}
          >
            {chip.icon && <span aria-hidden="true">{chip.icon}</span>}
            {chip.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
