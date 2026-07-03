export interface VirtualCardInput {
  /** @minLength 1 */
  cardNumber: string;
  /** @minLength 1 */
  cardHolderName: string;
  bank?: string;
}
