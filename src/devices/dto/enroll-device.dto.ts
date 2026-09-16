import { IsString, IsUUID } from 'class-validator';

export class EnrollDeviceDto {
  @IsUUID()
  agentId: string;

  @IsString()
  publicKey: string; // base64, Ed25519 — générée dans le Keystore matériel du mobile
}

export class BlockDeviceDto {
  @IsString()
  reason: string;
}
