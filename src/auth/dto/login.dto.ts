import { IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  username: string;

  // PIN à 4 chiffres côté UX mobile — voir section 2 : ceci est le facteur transmis
  // par l'app, le renforcement (Keystore, biométrie, ré-auth périodique) vit côté mobile.
  @IsString()
  @Length(4, 8)
  @Matches(/^\d+$/, { message: 'Le PIN doit être numérique' })
  pin: string;

  // Identifiant du device appelant, pour vérifier qu'il n'est pas BLOCKED/REVOKED
  // avant même d'émettre un token (défense en profondeur avec le DevicesModule).
  @IsString()
  deviceId: string;
}
