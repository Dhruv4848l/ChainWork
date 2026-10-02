import "server-only";
import { platformDb } from "@/lib/platformDb";
import { absoluteUrl } from "@/lib/email";
import { isReceiptNo, type ReceiptContent } from "./content";
import { renderReceiptPdf } from "./pdf";
import { verifyPath } from "./present";

/*
  Receipt reads for the consumer side (payment plan P2.4 / P2.5). Admin code must NOT
  use this module — it goes through bridge.bridgeReceipt() (two-DB boundary rule).
*/

export interface StoredReceipt {
  receiptNo: string;
  content: ReceiptContent;
  contentHash: string;
  payerUserId: string | null;
  payeeUserId: string | null;
}

export async function findReceipt(receiptNo: string): Promise<StoredReceipt | null> {
  if (!isReceiptNo(receiptNo)) return null;
  const r = await platformDb.receipt.findUnique({
    where: { receiptNo },
    include: { payment: { select: { payerUserId: true, payeeUserId: true } } },
  });
  if (!r) return null;
  return {
    receiptNo: r.receiptNo,
    content: r.content as unknown as ReceiptContent,
    contentHash: r.contentHash,
    payerUserId: r.payment.payerUserId,
    payeeUserId: r.payment.payeeUserId,
  };
}

/** Only the two parties to a payment may download its receipt. */
export function isReceiptParty(r: Pick<StoredReceipt, "payerUserId" | "payeeUserId">, userId: string): boolean {
  return r.payerUserId === userId || r.payeeUserId === userId;
}

export function receiptVerifyUrl(receiptNo: string, contentHash: string): string {
  return absoluteUrl(verifyPath(receiptNo, contentHash));
}

export async function receiptPdfBytes(r: Pick<StoredReceipt, "receiptNo" | "content" | "contentHash">): Promise<Uint8Array> {
  return renderReceiptPdf({ content: r.content, contentHash: r.contentHash, verifyUrl: receiptVerifyUrl(r.receiptNo, r.contentHash) });
}
