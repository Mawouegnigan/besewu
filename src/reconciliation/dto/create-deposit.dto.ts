import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateClosureDto {
  @IsUUID()
  agentId: string;

  @IsDateString()
  closureDate: string;
}

export class CreateDepositDto {
  @IsUUID()
  closureId: string;

  @IsInt()
  @Min(0)
  depositedAmount: number;
}

export class ResolveDisputeDto {
  @IsString()
  notes: string;
}
