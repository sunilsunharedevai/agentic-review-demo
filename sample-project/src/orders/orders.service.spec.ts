import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService(new ProductsService(), new UsersService());
  });

  it('creates an order for a valid customer', async () => {
    const order = await service.createOrder({ userId: 'user-1', productId: 'sku-basic', quantity: 1 });
    expect(order.total).toBe(20);
  });

  it('rejects negative quantity', async () => {
    await expect(service.createOrder({ userId: 'user-1', productId: 'sku-basic', quantity: -1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
