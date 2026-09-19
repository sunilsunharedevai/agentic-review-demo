import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { FindingStatus } from '@agentic-review/shared';

export class StartReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  repositoryPath?: string;
}

export class UpdateFindingDto {
  @IsIn(['OPEN', 'ACCEPTED', 'DISMISSED', 'RESOLVED'])
  status!: FindingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  dismissalReason?: string;
}
