import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { StartReviewDto, UpdateFindingDto } from './dto';
import { ReviewsService } from './reviews.service';
import type { Finding, QualityCheck, Review, TraceEvent } from '@agentic-review/shared';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  start(@Body() dto: StartReviewDto): Promise<Review> {
    return this.reviewsService.startReview(dto.repositoryPath);
  }

  @Get(':id')
  get(@Param('id') id: string): Review {
    return this.requireReview(id);
  }

  @Get(':id/findings')
  findings(@Param('id') id: string): Finding[] {
    return this.requireReview(id).findings;
  }

  @Get(':id/quality')
  quality(@Param('id') id: string): QualityCheck[] {
    return this.requireReview(id).qualityChecks;
  }

  @Get(':id/trace')
  trace(@Param('id') id: string): TraceEvent[] {
    return this.requireReview(id).trace;
  }

  @Patch(':reviewId/findings/:findingId')
  updateFinding(
    @Param('reviewId') reviewId: string,
    @Param('findingId') findingId: string,
    @Body() dto: UpdateFindingDto,
  ): Review {
    return this.reviewsService.updateFinding(reviewId, findingId, dto);
  }

  private requireReview(id: string): Review {
    const review = this.reviewsService.getReview(id);
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }
}
