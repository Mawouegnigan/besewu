import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { generateKeyPairSync, sign as cryptoSign } from 'crypto';
import { TransactionsService } from './transactions.service';
import { Transaction } from './entities/transaction.entity';
import { DevicesService } from '../devices/devices.service';
import { AuditService } from '../audit/audit.service';
import { DeviceStatus } from '../common/enums/device-status.enum';
import { TransactionStatus } from '../common/enums/transaction-status.enum';
import { buildSignedPayload } from './utils/signature.util';
import { SyncTransactionItemDto } from './dto/sync-transaction.dto';

function makeSignedItem(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  overrides: Partial<SyncTransactionItemDto> = {},
): SyncTransactionItemDto {
  const base: Omit<SyncTransactionItemDto, 'signature'> = {
    id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
    taxType: overrides.taxType ?? 'place_marche',
    amount: overrides.amount ?? 500,
    latitude: overrides.latitude ?? 6.4969,
    longitude: overrides.longitude ?? 2.6289,
    localTimestamp: overrides.localTimestamp ?? new Date().toISOString(),
  };
  const payload = buildSignedPayload({ ...base, deviceId: DEVICE_ID });
  const signature = cryptoSign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64');
  return { ...base, signature };
}

const DEVICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('TransactionsService.sync', () => {
  let service: TransactionsService;
  let repoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let devicesServiceMock: { findById: jest.Mock; touchLastSync: jest.Mock };
  let auditServiceMock: { record: jest.Mock };
  let publicKeyBase64: string;
  let privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];

  beforeEach(async () => {
    const keyPair = generateKeyPairSync('ed25519');
    privateKey = keyPair.privateKey;
    publicKeyBase64 = keyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

    // Stockage en mémoire pour simuler l'unicité de l'id (idempotence) et le dernier
    // hash de la chaîne, sans dépendre d'une vraie base PostgreSQL dans ces tests.
    const store = new Map<string, Partial<Transaction>>();

    repoMock = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where?.id) return store.get(where.id) ?? null;
        if (where?.agentId) {
          // findByAgent-like lookup for getLastHashForAgent: renvoie la dernière entrée insérée
          const all = [...store.values()].filter((t) => t.agentId === where.agentId);
          if (all.length === 0) return null;
          return all[all.length - 1];
        }
        return null;
      }),
      create: jest.fn((data) => data),
      save: jest.fn(async (entity) => {
        store.set(entity.id, entity);
        return entity;
      }),
    };

    devicesServiceMock = {
      findById: jest.fn(async () => ({
        id: DEVICE_ID,
        publicKey: publicKeyBase64,
        status: DeviceStatus.ACTIVE,
      })),
      touchLastSync: jest.fn(async () => undefined),
    };

    auditServiceMock = { record: jest.fn(async () => undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: repoMock },
        { provide: DevicesService, useValue: devicesServiceMock },
        { provide: AuditService, useValue: auditServiceMock },
        {
          provide: ConfigService,
          useValue: { get: (key: string, def?: string) => (key === 'MAX_CLOCK_DRIFT_HOURS' ? '48' : def) },
        },
      ],
    }).compile();

    service = moduleRef.get(TransactionsService);
  });

  it('accepte une transaction correctement signée, avec previousHash = GENESIS au premier envoi', async () => {
    const item = makeSignedItem(privateKey);
    const results = await service.sync(DEVICE_ID, AGENT_ID, [item]);

    expect(results).toEqual([{ id: item.id, outcome: 'accepted' }]);
    expect(repoMock.save).toHaveBeenCalledTimes(1);
  });

  it('traite un id déjà connu comme un doublon (idempotence) — pas de double comptage', async () => {
    const item = makeSignedItem(privateKey);
    await service.sync(DEVICE_ID, AGENT_ID, [item]);
    const secondResult = await service.sync(DEVICE_ID, AGENT_ID, [item]);

    expect(secondResult).toEqual([{ id: item.id, outcome: 'duplicate' }]);
    // save() n'est appelé qu'une seule fois au total (le doublon ne réécrit rien).
    expect(repoMock.save).toHaveBeenCalledTimes(1);
  });

  it('rejette une transaction dont la signature ne correspond pas à la clé publique du device', async () => {
    const attackerKeyPair = generateKeyPairSync('ed25519');
    const item = makeSignedItem(attackerKeyPair.privateKey, {
      id: '99999999-9999-9999-9999-999999999999',
    });

    const results = await service.sync(DEVICE_ID, AGENT_ID, [item]);

    expect(results).toEqual([{ id: item.id, outcome: 'rejected_signature' }]);
    expect(repoMock.save).not.toHaveBeenCalled();
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TRANSACTION_REJECTED_SIGNATURE' }),
    );
  });

  it('flagge (sans rejeter) une transaction dont l’horodatage local dérive trop de l’heure serveur', async () => {
    const farPast = new Date(Date.now() - 100 * 3600 * 1000).toISOString(); // 100h de dérive > seuil 48h
    const item = makeSignedItem(privateKey, {
      id: '77777777-7777-7777-7777-777777777777',
      localTimestamp: farPast,
    });

    const results = await service.sync(DEVICE_ID, AGENT_ID, [item]);

    expect(results).toEqual([{ id: item.id, outcome: 'flagged' }]);
    expect(repoMock.save).toHaveBeenCalledTimes(1);
    const saved = repoMock.save.mock.calls[0][0];
    expect(saved.status).toBe(TransactionStatus.FLAGGED);
    expect(saved.clockTampered).toBe(true);
  });

  it('rejette tout le lot si le device n’est pas ACTIVE (bloqué/révoqué)', async () => {
    devicesServiceMock.findById.mockResolvedValueOnce({
      id: DEVICE_ID,
      publicKey: publicKeyBase64,
      status: DeviceStatus.BLOCKED,
    });
    const item = makeSignedItem(privateKey);

    await expect(service.sync(DEVICE_ID, AGENT_ID, [item])).rejects.toThrow();
    expect(repoMock.save).not.toHaveBeenCalled();
  });

  it('chaîne deux transactions successives : la seconde référence le hash de la première', async () => {
    const item1 = makeSignedItem(privateKey, { id: '11111111-1111-1111-1111-111111111111' });
    await service.sync(DEVICE_ID, AGENT_ID, [item1]);
    const firstSaved = repoMock.save.mock.calls[0][0];

    const item2 = makeSignedItem(privateKey, {
      id: '22222222-2222-2222-2222-222222222222',
      amount: 300,
    });
    await service.sync(DEVICE_ID, AGENT_ID, [item2]);
    const secondSaved = repoMock.save.mock.calls[1][0];

    expect(secondSaved.previousHash).toBe(firstSaved.hash);
  });
});
