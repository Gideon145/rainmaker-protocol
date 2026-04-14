import { randomUUID } from "crypto";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const uuid = () => randomUUID();

export function formatUsdc(amount: number): string {
  return `$${amount.toFixed(2)} USDC`;
}

export function calcRoi(spent: number, earned: number): string {
  if (spent === 0) return "∞×";
  return `${(earned / spent).toFixed(1)}×`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
