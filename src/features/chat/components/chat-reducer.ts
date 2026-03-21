import type { ChatMessage, OAIMessage } from "../types";

// ---------------------------------------------------------------------------
// Estado del chat
// ---------------------------------------------------------------------------
export interface ChatState {
  messages: ChatMessage[];
  input: string;
  isOpen: boolean;
  history: OAIMessage[];
  sessionTokens: number;
}

export type ChatAction =
  | { type: "TOGGLE" }
  | { type: "SET_INPUT"; payload: string }
  | { type: "ADD_MESSAGE"; payload: ChatMessage }
  | { type: "UPDATE_MESSAGE"; id: string; patch: Partial<ChatMessage> }
  | { type: "REMOVE_MESSAGE"; id: string }
  | { type: "TRUNCATE_FROM"; index: number }
  | { type: "REMOVE_TOOL_STATUS" }
  | { type: "SET_HISTORY"; payload: OAIMessage[] }
  | { type: "ADD_TOKENS"; amount: number }
  | { type: "CLEAR" };

export const initialState: ChatState = {
  messages: [],
  input: "",
  isOpen: false,
  history: [],
  sessionTokens: 0,
};

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "TOGGLE":
      return { ...state, isOpen: !state.isOpen };
    case "SET_INPUT":
      return { ...state, input: action.payload };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m
        ),
      };
    case "REMOVE_MESSAGE":
      return {
        ...state,
        messages: state.messages.filter((m) => m.id !== action.id),
      };
    case "TRUNCATE_FROM":
      return { ...state, messages: state.messages.slice(0, action.index) };
    case "REMOVE_TOOL_STATUS":
      return {
        ...state,
        messages: state.messages.filter((m) => m.role !== "tool_status"),
      };
    case "SET_HISTORY":
      return { ...state, history: action.payload };
    case "ADD_TOKENS":
      return { ...state, sessionTokens: state.sessionTokens + action.amount };
    case "CLEAR":
      return { ...state, messages: [], history: [], sessionTokens: 0 };
    default:
      return state;
  }
}
