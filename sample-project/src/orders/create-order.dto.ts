export class CreateOrderDto {
  userId!: string;
  productId!: string;
  quantity!: number;
  couponCode?: string;
}
