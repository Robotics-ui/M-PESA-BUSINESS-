export type CustomerLoanStatus = typeof CustomerLoanStatus[keyof typeof CustomerLoanStatus];

export const CustomerLoanStatus = {
  active: 'active',
  frozen: 'frozen',
  rejected: 'rejected',
} as const;

export interface CustomerLoanStatusUpdate {
  loanStatus: CustomerLoanStatus;
}
