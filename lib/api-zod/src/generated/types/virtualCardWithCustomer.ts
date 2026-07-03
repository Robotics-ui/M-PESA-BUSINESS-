import type { VirtualCard } from './virtualCard';

export interface VirtualCardWithCustomer extends VirtualCard {
  customerName: string;
  customerEmail: string | null;
}
