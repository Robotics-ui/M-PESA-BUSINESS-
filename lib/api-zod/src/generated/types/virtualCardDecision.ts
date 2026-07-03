export type VirtualCardDecisionStatus = typeof VirtualCardDecisionStatus[keyof typeof VirtualCardDecisionStatus];

export const VirtualCardDecisionStatus = {
  approved: 'approved',
  rejected: 'rejected',
  request_new: 'request_new',
} as const;

export interface VirtualCardDecision {
  status: VirtualCardDecisionStatus;
  rejectionReason?: string;
}
