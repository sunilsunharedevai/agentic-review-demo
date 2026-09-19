import { Module } from '@nestjs/common';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { ProductsService } from './products/products.service';
import { UsersService } from './users/users.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, ProductsService, UsersService],
})
export class AppModule {}
