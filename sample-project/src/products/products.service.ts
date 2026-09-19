import { Injectable } from '@nestjs/common';

export type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  restrictedToUserIds?: string[];
};

@Injectable()
export class ProductsService {
  private readonly products: Product[] = [
    { id: 'sku-basic', name: 'Basic Plan', price: 20, stock: 10 },
    { id: 'sku-enterprise', name: 'Enterprise Plan', price: 500, stock: 2, restrictedToUserIds: ['user-admin'] },
  ];

  async findById(id: string): Promise<Product | undefined> {
    return this.products.find((product) => product.id === id);
  }

  async reserve(productId: string, quantity: number): Promise<void> {
    const product = await this.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    product.stock -= quantity;
  }
}
