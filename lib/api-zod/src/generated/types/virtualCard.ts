import type { VirtualCardStatus } from './virtualCardStatus';

export interface VirtualCard {
  id: string;
  customerId: string;
  cardNumber: string;
  cardHolderName: string;
  /** @nullable */
  bank: string | null;
  status: VirtualCardStatus;
  /** @nullable */
  rejectionReason: string | null;
  /** @nullable */
  approvedBy: string | null;
  /** @nullable */
  approvedAt: Date | null;
  createdAt: Date;
}
