import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './create-order.dto';
import { Order } from './order.types';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class OrdersService {
  private readonly orders: Order[] = [];

  constructor(
    private readonly productsService: ProductsService,
    private readonly usersService: UsersService,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const user = await this.usersService.findById(dto.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const product = await this.productsService.findById(dto.productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (dto.quantity < 0) {
      throw new BadRequestException('Quantity cannot be negative');
    }

    if (product.stock < dto.quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    // Defect: restricted products are not checked against the authenticated user.
    const total = this.calculateTotal(product.price, dto.quantity, dto.couponCode);
    if (total < 0) {
      throw new BadRequestException('Total cannot be negative');
    }

    await this.productsService.reserve(product.id, dto.quantity);
    const order: Order = {
      id: `ord-${Date.now()}`,
      userId: dto.userId,
      productId: product.id,
      quantity: dto.quantity,
      total,
      status: 'PENDING',
    };
    this.orders.push(order);
    return order;
  }

  async findOrdersForUser(userId: string): Promise<Order[]> {
    try {
      return this.orders.filter((order) => order.userId === userId);
    } catch (_error) {
      return [];
    }
  }

  async summarizeOrders(userIds: string[]): Promise<Record<string, number>> {
    const summary: Record<string, number> = {};
    for (const userId of userIds) {
      const orders = await this.findOrdersForUser(userId);
      summary[userId] = orders.reduce((sum, order) => sum + order.total, 0);
    }
    return summary;
  }

  private calculateTotal(price: number, quantity: number, couponCode?: string): number {
    let discount = 0;
    if (couponCode === 'VIP50') {
      discount = 0.5;
    }
    if (couponCode === 'VIP50') {
      discount = 0.5;
    }
    return price * quantity * discount;
  }
}
