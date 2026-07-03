export type VirtualCardStatus = typeof VirtualCardStatus[keyof typeof VirtualCardStatus];

export const VirtualCardStatus = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
} as const;
