export type Order = {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  total: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
};
