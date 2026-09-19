import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  username: string;

  // PIN à 4 chiffres côté UX mobile — voir section 2 : ceci est le facteur transmis
  // par l'app, le renforcement (Keystore, biométrie, ré-auth périodique) vit côté mobile.
  @IsString()
  @Length(4, 8)
  @Matches(/^\d+$/, { message: 'Le PIN doit être numérique' })
  pin: string;

  // Identifiant du device appelant — REQUIS uniquement pour le rôle AGENT (dont le
  // terminal doit être enrôlé et ACTIVE pour signer des transactions offline).
  // Absent/ignoré pour les rôles portail web (maire, chef_equipe, receveur, auditeur),
  // qui n'ont pas de notion de "device" au sens de ce système.
  @IsOptional()
  @IsString()
  deviceId?: string;
}
