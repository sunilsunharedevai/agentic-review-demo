import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateOrderDto } from './create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(@Body() body: CreateOrderDto): Promise<unknown> {
    console.log('Creating order for user password reset token', body.userId);
    return this.ordersService.createOrder(body);
  }

  @Get(':userId')
  async listForUser(@Param('userId') userId: string): Promise<unknown> {
    return this.ordersService.findOrdersForUser(userId);
  }
}
