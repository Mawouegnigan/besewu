import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SyncTransactionItemDto {
  @IsUUID()
  id: string; // Généré côté mobile — clé d'idempotence

  @IsString()
  taxType: string;

  @IsOptional()
  @IsString()
  marketOrSector?: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  @IsDateString()
  localTimestamp: string;

  // Signature Ed25519 base64 de {id, deviceId, amount, taxType, localTimestamp}
  // produite dans le Keystore matériel du device (section 3, Option B).
  @IsString()
  signature: string;
}

/**
 * Une requête de sync transporte un lot de transactions collectées offline
 * (potentiellement plusieurs jours de collecte d'un coup).
 */
export class SyncTransactionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncTransactionItemDto)
  transactions: SyncTransactionItemDto[];
}

export class CancelTransactionDto {
  @IsString()
  reason: string;
}
