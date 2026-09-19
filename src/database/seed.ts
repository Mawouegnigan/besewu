import 'reflect-metadata';
import { generateKeyPairSync, sign as cryptoSign } from 'crypto';
import { AppDataSource } from '../config/data-source';
import { User } from '../users/entities/user.entity';
import { Device } from '../devices/entities/device.entity';
import { Role } from '../common/enums/role.enum';
import { DeviceStatus } from '../common/enums/device-status.enum';
import { AuthService } from '../auth/auth.service';
import { buildSignedPayload } from '../transactions/utils/signature.util';

/**
 * Seed de données de démo — SANS QUOI PERSONNE NE PEUT SE CONNECTER, puisque le
 * système n'expose volontairement aucun endpoint de création de compte (les comptes
 * sont provisionnés par la mairie, jamais auto-inscrits — cohérent avec le RBAC).
 *
 * Usage : npm run seed
 *
 * Ce script est idempotent : le relancer ne duplique pas les comptes déjà créés
 * (vérifie par username avant insertion).
 *
 * ⚠️ Les identifiants affichés en sortie sont pour DÉMO/DÉVELOPPEMENT UNIQUEMENT.
 * Ne jamais utiliser des PIN aussi simples en production.
 */

const DEMO_USERS: Array<{
  username: string;
  pin: string;
  role: Role;
  fullName: string;
  supervisorPhone?: string;
}> = [
  { username: 'maire.cotonou', pin: '1234', role: Role.MAIRE, fullName: 'Maire de Cotonou (démo)' },
  {
    username: 'chef.dantokpa',
    pin: '2345',
    role: Role.CHEF_EQUIPE,
    fullName: 'Chef d\'équipe — Marché Dantokpa (démo)',
  },
  {
    username: 'receveur.cotonou',
    pin: '3456',
    role: Role.RECEVEUR,
    fullName: 'Receveur municipal (démo)',
  },
  { username: 'auditeur.demo', pin: '4567', role: Role.AUDITEUR, fullName: 'Auditeur externe (démo)' },
  {
    username: 'agent.kofi',
    pin: '5678',
    role: Role.AGENT,
    fullName: 'Kofi — Agent collecteur (démo)',
    supervisorPhone: '+229 00 00 00 00',
  },
];

async function seed() {
  await AppDataSource.initialize();
  console.log('Connecté à la base. Démarrage du seed...\n');

  const userRepo = AppDataSource.getRepository(User);
  const deviceRepo = AppDataSource.getRepository(Device);

  const createdCredentials: Array<{ username: string; pin: string; role: string }> = [];
  const usersByUsername = new Map<string, User>();

  for (const demo of DEMO_USERS) {
    let user = await userRepo.findOne({ where: { username: demo.username } });
    if (user) {
      console.log(`- Utilisateur déjà existant, ignoré : ${demo.username}`);
      usersByUsername.set(demo.username, user);
      continue;
    }

    const pinHash = await AuthService.hashPin(demo.pin);
    user = userRepo.create({
      username: demo.username,
      pinHash,
      role: demo.role,
      fullName: demo.fullName,
      supervisorPhone: demo.supervisorPhone,
    });
    user = await userRepo.save(user);
    usersByUsername.set(demo.username, user);
    createdCredentials.push({ username: demo.username, pin: demo.pin, role: demo.role });
    console.log(`+ Utilisateur créé : ${demo.username} (${demo.role})`);
  }

  // --- Enrôlement d'un device de test pour l'agent de démo ---
  const agent = usersByUsername.get('agent.kofi')!;
  let device = await deviceRepo.findOne({ where: { agentId: agent.id } });
  let devicePrivateKeyBase64: string | null = null;

  if (device) {
    console.log(`\n- Device déjà enrôlé pour ${agent.username}, ignoré (id: ${device.id}).`);
  } else {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    devicePrivateKeyBase64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

    device = deviceRepo.create({
      agentId: agent.id,
      publicKey: publicKeyBase64,
      status: DeviceStatus.ACTIVE,
    });
    device = await deviceRepo.save(device);
    console.log(`\n+ Device de test enrôlé pour ${agent.username} (id: ${device.id})`);
  }

  // --- Exemple de transaction signée, prêt à envoyer via POST /transactions/sync ---
  let exampleCurl = '';
  if (devicePrivateKeyBase64) {
    const { createPrivateKey } = await import('crypto');
    const privateKeyObj = createPrivateKey({
      key: Buffer.from(devicePrivateKeyBase64, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });

    const exampleItem = {
      id: '00000000-0000-4000-8000-000000000001',
      taxType: 'place_marche',
      amount: 500,
      latitude: 6.4969,
      longitude: 2.6289,
      localTimestamp: new Date().toISOString(),
    };
    const payload = buildSignedPayload({ ...exampleItem, deviceId: device.id });
    const signature = cryptoSign(null, Buffer.from(payload, 'utf8'), privateKeyObj).toString('base64');

    exampleCurl = JSON.stringify(
      { transactions: [{ ...exampleItem, signature }] },
      null,
      2,
    );
  }

  console.log('\n' + '='.repeat(72));
  console.log('SEED TERMINÉ — Identifiants de démo (PIN en clair, dev uniquement)');
  console.log('='.repeat(72));

  if (createdCredentials.length === 0) {
    console.log('Aucun nouveau compte créé (tous existaient déjà).');
  } else {
    for (const c of createdCredentials) {
      console.log(`  username: ${c.username.padEnd(20)} pin: ${c.pin.padEnd(6)} role: ${c.role}`);
    }
  }

  console.log('\nConnexion (exemple, rôle non-agent — pas de deviceId requis) :');
  console.log(
    `  curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"username":"maire.cotonou","pin":"1234"}'`,
  );
  console.log('  (seul le rôle AGENT doit fournir un deviceId correspondant à un device');
  console.log('   ACTIVE et lui appartenant — voir ci-dessous pour agent.kofi.)');

  console.log(`\nDevice de test pour agent.kofi : ${device.id}`);
  console.log('Connexion agent.kofi (exemple) :');
  console.log(
    `  curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"username":"agent.kofi","pin":"5678","deviceId":"${device.id}"}'`,
  );
  if (devicePrivateKeyBase64) {
    console.log('Clé privée du device (à garder pour signer des transactions de test) :');
    console.log(`  ${devicePrivateKeyBase64}`);
  }

  if (exampleCurl) {
    console.log('\nExemple de corps de requête pour PATCH /transactions/sync (agent.kofi) :');
    console.log(exampleCurl);
  }

  console.log('\n' + '='.repeat(72));

  await AppDataSource.destroy();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Échec du seed :', err);
    process.exit(1);
  });
