import { BadRequestException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  it('rejects repository paths outside workspace', async () => {
    const service = new ReviewsService();
    await expect(service.startReview('../')).rejects.toBeInstanceOf(BadRequestException);
  });
});
