import type { Response } from "express";

const clients = new Map<number, Set<Response>>();

export function sseSubscribe(conversationId: number, res: Response): void {
  if (!clients.has(conversationId)) clients.set(conversationId, new Set());
  clients.get(conversationId)!.add(res);
}

export function sseUnsubscribe(conversationId: number, res: Response): void {
  const group = clients.get(conversationId);
  if (!group) return;
  group.delete(res);
  if (group.size === 0) clients.delete(conversationId);
}

export function sseBroadcast(conversationId: number, payload: unknown): void {
  const group = clients.get(conversationId);
  if (!group?.size) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of [...group]) {
    try {
      res.write(line);
    } catch {
      group.delete(res);
    }
  }
}
