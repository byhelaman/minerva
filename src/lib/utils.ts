import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Safely extract an error message from an unknown catch value. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}
